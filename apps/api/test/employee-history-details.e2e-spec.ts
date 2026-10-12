import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  govdataGroupSchema,
  salaryGroupSchema,
  type PersonHistoryEntry,
  type PersonHistoryResponse,
} from '@hr/contracts';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import { PolicyService } from '../src/modules/auth/public-api';
import { GOVDATA_FIELDS, SALARY_FIELDS } from '../src/modules/employees/public-api';
import { detailsFor } from '../src/modules/history/public-api';
import {
  cleanupHelperUsers,
  HELPER_EMAIL_PREFIX,
  loginAsEnrolledStaff,
  loginAsStaff,
  type TestPrincipal,
} from './helpers/login';

// HIST-01 (ADR-022): a person's History shows WHAT changed, from what to what —
// by the reader's own field access. Pay details need `salary.read`, ID fields
// need `govdata.read`, the account's details need `employee-user.read`. A reader
// without the permission still sees that the event happened, and is told which
// kind of detail was withheld.

const MARK = 'HIST-01';
const db = () =>
  new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }) });

type Entry = PersonHistoryEntry;
const find = (entries: Entry[], resource: string, action: string) =>
  entries.find((e) => e.resource === resource && e.action === action);
const dump = (e: Entry | undefined) => JSON.stringify([e?.before ?? null, e?.after ?? null]);

async function fixture(app: INestApplication, owner: PrismaClient, hr: TestPrincipal) {
  const http = () => app.getHttpServer();
  const clientId = (await owner.client.create({ data: { nameAr: 'شركة', nameEn: `${MARK} co` } }))
    .id;
  await owner.clientSetting.create({
    data: { clientId, key: 'flag.employee-self-service', value: true },
  });
  const send = (method: 'post' | 'patch', path: string, body: object) =>
    (method === 'post' ? request(http()).post(path) : request(http()).patch(path))
      .set('Cookie', hr.cookie)
      .send(body);
  const employeeId = (
    await send('post', '/employees', {
      clientId,
      name: { en: `${MARK} person`, ar: 'شخص' },
      nationality: 'IN',
      contractType: 'unlimited',
      jobTitleEn: 'Clerk',
      salary: { currency: 'SAR', basicSalary: 5123 },
      govdata: { iqamaNumber: '2111111111', iqamaExpiry: '2027-01-01' },
    }).expect(201)
  ).body.id as string;
  await send('patch', `/employees/${employeeId}`, { jobTitleEn: 'Accountant' }).expect(200);
  await send('patch', `/employees/${employeeId}/salary`, {
    basicSalary: 6234,
    bankIban: 'SA0380000000608010167519',
  }).expect(200);
  await send('patch', `/employees/${employeeId}/govdata`, {
    iqamaNumber: '2222222222',
    iqamaExpiry: '2028-01-01',
  }).expect(200);
  const dependantId = (
    await send('post', `/employees/${employeeId}/dependants`, {
      relationship: 'son',
      nameEn: `${MARK} child`,
      iqamaNumber: '2311111111',
    }).expect(201)
  ).body.id as string;
  await send('patch', `/employees/${employeeId}/dependants/${dependantId}`, {
    iqamaNumber: '2322222222',
    passportExpiry: '2030-02-02',
  }).expect(200);
  const email = `${HELPER_EMAIL_PREFIX}${randomUUID()}@example.com`;
  await send('post', `/employee-accounts/${employeeId}/invite`, { email }).expect(200);
  return { clientId, employeeId, email };
}

async function cleanup(owner: PrismaClient, clientId: string, employeeId: string) {
  await owner.auditEntry.deleteMany({ where: { clientId } });
  await owner.auditEntry.deleteMany({ where: { resourceId: employeeId } });
  await owner.dependant.deleteMany({ where: { employeeId } });
  await owner.authUser.deleteMany({ where: { employeeId } });
  await owner.employee.deleteMany({ where: { clientId } });
  await owner.clientSetting.deleteMany({ where: { clientId } });
  await owner.client.deleteMany({ where: { id: clientId } });
}

describe('What a History reader may see of an entry — the rule (HIST-01)', () => {
  const holds =
    (...permissions: string[]) =>
    (p: string) =>
      permissions.includes(p);
  const edit = {
    before: { nameEn: 'Sara', basicSalary: 5000 },
    after: { nameEn: 'Sara', basicSalary: 6000 },
  };

  it('a kind of record nobody has decided about shows no details at all', () => {
    expect(detailsFor({ resource: 'something-new', ...edit }, () => true)).toEqual({
      before: null,
      after: null,
      withheld: ['record'],
    });
  });

  it('a reader who cannot read the record itself gets none of it', () => {
    expect(detailsFor({ resource: 'employee', ...edit }, holds('salary.read')).withheld).toEqual([
      'record',
    ]);
    const doc = { resource: 'document', before: null, after: { title: 'Passport copy' } };
    expect(detailsFor(doc, holds('employee.read'))).toEqual({
      before: null,
      after: null,
      withheld: ['record'],
    });
    expect(detailsFor(doc, holds('document.read')).after).toEqual({ title: 'Passport copy' });
  });

  it('names each kind of detail it withheld, once', () => {
    const both = {
      resource: 'employee',
      before: null,
      after: { nameEn: 'Sara', basicSalary: 5000, bankIban: 'SA03', iqamaNumber: '2111111111' },
    };
    const seen = detailsFor(both, holds('employee.read'));
    expect(seen.after).toEqual({ nameEn: 'Sara' });
    expect([...seen.withheld].sort()).toEqual(['ids', 'pay']);
    expect(
      detailsFor(both, holds('employee.read', 'salary.read', 'govdata.read')).withheld,
    ).toEqual([]);
  });

  it('what only locates the record never reaches a reader', () => {
    const step = {
      resource: 'gro-sequence',
      before: null,
      after: { sequenceId: 's-1', kind: 'onboarding', step: 'iqama' },
    };
    expect(detailsFor(step, holds('gro.read')).after).toEqual({
      kind: 'onboarding',
      step: 'iqama',
    });
    const dep = {
      resource: 'dependant',
      before: null,
      after: { dependantId: 'd-1', nameEn: 'Child' },
    };
    expect(detailsFor(dep, holds('employee.read')).after).toEqual({ nameEn: 'Child' });
  });

  it('an entry with one side keeps having one side', () => {
    const seen = detailsFor(
      { resource: 'dependant', before: { nameEn: 'Child' }, after: null },
      holds('employee.read'),
    );
    expect(seen).toEqual({ before: { nameEn: 'Child' }, after: null, withheld: [] });
  });
});

describe("A person's History shows what changed (HIST-01, e2e)", () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let hr: TestPrincipal;
  let gro: TestPrincipal;
  let auditor: TestPrincipal;
  let clientId = '';
  let employeeId = '';
  let email = '';

  const history = async (who: TestPrincipal): Promise<Entry[]> =>
    (
      (
        await request(app.getHttpServer())
          .get(`/employees/${employeeId}/history`)
          .set('Cookie', who.cookie)
          .expect(200)
      ).body as PersonHistoryResponse
    ).entries;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    owner = db();
    hr = await loginAsStaff(app, 'hr_officer');
    gro = await loginAsStaff(app, 'gro_officer');
    auditor = await loginAsEnrolledStaff(app, 'auditor');
    ({ clientId, employeeId, email } = await fixture(app, owner, hr));
  });

  afterAll(async () => {
    await cleanup(owner, clientId, employeeId);
    await cleanupHelperUsers(app);
    await owner.$disconnect();
    await app.close();
  });

  it('an entry carries its two sides and what was withheld — and nothing else', async () => {
    for (const e of await history(hr)) {
      expect(Object.keys(e).sort()).toEqual(
        [
          'action',
          'actor',
          'after',
          'at',
          'before',
          'id',
          'resource',
          'subject',
          'withheld',
        ].sort(),
      );
    }
  });

  it('a reader with full access sees every change, old and new — pay and ID values included', async () => {
    const entries = await history(hr);
    const core = find(entries, 'employee', 'update');
    expect(core?.before).toMatchObject({ jobTitleEn: 'Clerk' });
    expect(core?.after).toMatchObject({ jobTitleEn: 'Accountant' });
    expect(core?.withheld).toEqual([]);

    const pay = find(entries, 'employee', 'salary-update');
    expect(pay?.before).toMatchObject({ basicSalary: 5123, bankIban: null });
    expect(pay?.after).toMatchObject({ basicSalary: 6234, bankIban: 'SA0380000000608010167519' });
    expect(pay?.withheld).toEqual([]);

    const ids = find(entries, 'employee', 'govdata-update');
    expect(ids?.before).toMatchObject({ iqamaNumber: '2111111111', iqamaExpiry: '2027-01-01' });
    expect(ids?.after).toMatchObject({ iqamaNumber: '2222222222', iqamaExpiry: '2028-01-01' });

    const dep = find(entries, 'dependant', 'update');
    expect(dep?.before).toMatchObject({ iqamaNumber: '2311111111' });
    expect(dep?.after).toMatchObject({ iqamaNumber: '2322222222', passportExpiry: '2030-02-02' });

    expect(find(entries, 'employee-user', 'invite')?.after).toMatchObject({ email });
    // The Auditor reads pay and IDs too.
    expect(find(await history(auditor), 'employee', 'salary-update')?.after).toMatchObject({
      basicSalary: 6234,
    });
  });

  it('the GRO officer — who cannot read pay — sees that pay changed, never the amounts', async () => {
    const entries = await history(gro);
    const pay = find(entries, 'employee', 'salary-update');
    expect(pay).toBeDefined();
    expect(pay?.withheld).toEqual(['pay']);
    expect(dump(pay)).not.toMatch(/5123|6234|SA0380000000608010167519|basicSalary|bankIban/);

    // A new record holds everything at once: its pay is withheld, the rest is not.
    const created = find(entries, 'employee', 'create');
    expect(created?.withheld).toEqual(['pay']);
    expect(created?.after).toMatchObject({ jobTitleEn: 'Clerk', iqamaNumber: '2111111111' });
    expect(dump(created)).not.toMatch(/5123|basicSalary|currency/);

    // What they may read is all there: the record, the IDs, the family.
    expect(find(entries, 'employee', 'update')?.after).toMatchObject({ jobTitleEn: 'Accountant' });
    expect(find(entries, 'employee', 'govdata-update')?.after).toMatchObject({
      iqamaNumber: '2222222222',
    });
    expect(find(entries, 'dependant', 'update')?.after).toMatchObject({
      iqamaNumber: '2322222222',
    });
  });

  it('the GRO officer — who does not manage accounts — sees the invitation, not the address', async () => {
    const invite = find(await history(gro), 'employee-user', 'invite');
    expect(invite).toBeDefined();
    expect(invite?.withheld).toEqual(['account']);
    expect(invite?.before).toBeNull();
    expect(invite?.after).toBeNull();
    expect(dump(invite)).not.toContain(email);
  });

  it('nothing reaches a reader in any entry that the rules withhold from them', async () => {
    const all = JSON.stringify(await history(gro));
    for (const secret of ['5123', '6234', 'SA0380000000608010167519', email]) {
      expect(all, secret).not.toContain(secret);
    }
  });

  it('the pay and ID field lists are the record’s own groups — they cannot drift apart', () => {
    expect([...SALARY_FIELDS].sort()).toEqual(Object.keys(salaryGroupSchema.shape).sort());
    expect([...GOVDATA_FIELDS].sort()).toEqual(Object.keys(govdataGroupSchema.shape).sort());
  });
});

// Every staff role reads IDs today, so the ID rule needs a narrower reader than
// any real one: an HR officer with `govdata.read` taken away.
describe("A person's History — ID details need govdata.read (HIST-01, narrowed policy)", () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let hr: TestPrincipal;
  let clientId = '';
  let employeeId = '';

  // The fixture is written by the real HR officer; the reader is narrowed afterwards.
  let narrowed = false;
  class NarrowedPolicy extends PolicyService {
    override can(role: string | null | undefined, permission: string): boolean {
      if (narrowed && role === 'hr_officer' && permission === 'govdata.read') return false;
      return super.can(role, permission);
    }
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PolicyService)
      .useClass(NarrowedPolicy)
      .compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    owner = db();
    hr = await loginAsStaff(app, 'hr_officer');
    ({ clientId, employeeId } = await fixture(app, owner, hr));
    narrowed = true;
  });

  afterAll(async () => {
    await cleanup(owner, clientId, employeeId);
    await cleanupHelperUsers(app);
    await owner.$disconnect();
    await app.close();
  });

  it('without govdata.read: the ID edit is withheld whole, and a dependant keeps all but the number', async () => {
    const entries = (
      (
        await request(app.getHttpServer())
          .get(`/employees/${employeeId}/history`)
          .set('Cookie', hr.cookie)
          .expect(200)
      ).body as PersonHistoryResponse
    ).entries;

    const ids = find(entries, 'employee', 'govdata-update');
    expect(ids?.withheld).toEqual(['ids']);
    // As on the record itself: without the permission, the dates go with the numbers.
    expect(dump(ids)).not.toMatch(/2111111111|2222222222|2027-01-01|2028-01-01|iqama/);

    const dep = find(entries, 'dependant', 'update');
    expect(dep?.withheld).toEqual(['ids']);
    expect(dep?.after).toMatchObject({ passportExpiry: '2030-02-02' });
    expect(dump(dep)).not.toMatch(/2311111111|2322222222|iqamaNumber/);

    // Pay is still theirs to read.
    expect(find(entries, 'employee', 'salary-update')?.after).toMatchObject({ basicSalary: 6234 });
    expect(JSON.stringify(entries)).not.toMatch(/2111111111|2222222222|2311111111|2322222222/);
  });
});
