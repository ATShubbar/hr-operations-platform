import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import {
  cleanupHelperUsers,
  loginAsClientRep,
  loginAsEmployee,
  loginAsEnrolledStaff,
  loginAsStaff,
  type TestPrincipal,
} from './helpers/login';

// PROF-01 (ADR-019): the client profile — identity (CR, city, sector), a STORED
// Nitaqat band with the day it was checked, registrations, a main contact,
// signatories, the portals we hold credentials FOR (names only), and service
// facts. Administrators change it (the matrix, unchanged); other staff read; a
// client manager reads their OWN company's through the portal. Every field is
// optional and a missing one is null.
const MARK = 'PROF-01-test';
const FLAG = 'flag.client-self-service';

const day = (offset: number): string => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

const TOP_KEYS = [
  'city',
  'contact',
  'crNumber',
  'createdAt',
  'id',
  'name',
  'nitaqat',
  'portals',
  'registrations',
  'sector',
  'service',
  'signatories',
  'status',
  'updatedAt',
];

describe('Client profile (PROF-01, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let admin: TestPrincipal;
  let hr: TestPrincipal;
  let gro: TestPrincipal;
  let auditor: TestPrincipal;
  let repA: TestPrincipal;
  let repB: TestPrincipal;
  let employee: TestPrincipal;
  const ids = { a: '', b: '', person: '' };
  // Distinct per run, so a leftover row from a crashed run cannot collide.
  const CR_A = `10${String(Date.now()).slice(-8)}`;

  const http = () => request(app.getHttpServer());
  const patch = (id: string, body: unknown, who: TestPrincipal = admin) =>
    http()
      .patch(`/clients/${id}`)
      .set('Cookie', who.cookie)
      .send(body as object);

  const FULL = () => ({
    crNumber: CR_A,
    city: 'riyadh',
    sector: 'construction',
    nitaqat: { band: 'yellow', checkedOn: day(-3) },
    registrations: {
      qiwaEstablishment: '1-1010224417',
      gosiEstablishment: '201-448-7712',
      vatNumber: '310122441700003',
    },
    contact: {
      nameEn: 'Hana Bin Turki',
      nameAr: 'هناء بنت تركي',
      role: 'HR Director',
      email: 'hana.t@example.com',
      phone: '+966 55 214 8890',
    },
    signatories: [
      { name: 'Hana Bin Turki', role: 'HR Director' },
      { name: 'Abdulaziz Al Faisal', role: 'General Manager' },
    ],
    portals: ['qiwa', 'muqeem', 'gosi'],
    service: {
      officerUserId: gro.userId,
      tier: 'professional',
      responseCommitment: 'same_working_day',
      termStart: day(-200),
      termEnd: day(165),
    },
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    owner = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
    });
    await cleanup();
    ids.a = (await owner.client.create({ data: { nameAr: 'شركة أ', nameEn: `${MARK} A` } })).id;
    ids.b = (await owner.client.create({ data: { nameAr: 'شركة ب', nameEn: `${MARK} B` } })).id;
    ids.person = (
      await owner.employee.create({
        data: {
          clientId: ids.a,
          nameAr: 'موظف',
          nameEn: `${MARK} person`,
          nationality: 'IN',
          contractType: 'unlimited',
        },
      })
    ).id;
    await owner.clientSetting.createMany({
      data: [ids.a, ids.b].map((clientId) => ({ clientId, key: FLAG, value: true })),
    });
    admin = await loginAsEnrolledStaff(app, 'administrator');
    hr = await loginAsStaff(app, 'hr_officer');
    gro = await loginAsStaff(app, 'gro_officer');
    auditor = await loginAsEnrolledStaff(app, 'auditor');
    repA = await loginAsClientRep(app, ids.a, 'client_manager');
    repB = await loginAsClientRep(app, ids.b, 'client_manager');
    employee = await loginAsEmployee(app, ids.person);
    await owner.authUser.update({
      where: { id: gro.userId },
      data: { displayName: 'Tariq Al-Subaie' },
    });
  });

  async function cleanup(): Promise<void> {
    const cos = (
      await owner.client.findMany({ where: { nameEn: { startsWith: MARK } }, select: { id: true } })
    ).map((c) => c.id);
    await owner.auditEntry.deleteMany({ where: { clientId: { in: cos } } });
    await owner.clientSetting.deleteMany({ where: { clientId: { in: cos } } });
    await owner.employee.deleteMany({ where: { clientId: { in: cos } } });
    await owner.client.deleteMany({ where: { id: { in: cos } } });
  }

  afterAll(async () => {
    await cleanupHelperUsers(app);
    await cleanup();
    await owner.$disconnect();
    await app.close();
  });

  it('a client with nothing recorded answers every profile field as null or empty — exact keys', async () => {
    const res = await http().get(`/clients/${ids.b}`).set('Cookie', hr.cookie).expect(200);
    expect(Object.keys(res.body).sort()).toEqual(TOP_KEYS);
    expect(res.body).toMatchObject({
      crNumber: null,
      city: null,
      sector: null,
      nitaqat: null,
      registrations: { qiwaEstablishment: null, gosiEstablishment: null, vatNumber: null },
      contact: { nameEn: null, nameAr: null, role: null, email: null, phone: null },
      signatories: [],
      portals: [],
      service: {
        officerUserId: null,
        officer: null,
        tier: null,
        responseCommitment: null,
        termStart: null,
        termEnd: null,
      },
    });
    expect(Object.keys(res.body.registrations).sort()).toEqual([
      'gosiEstablishment',
      'qiwaEstablishment',
      'vatNumber',
    ]);
    expect(Object.keys(res.body.contact).sort()).toEqual([
      'email',
      'nameAr',
      'nameEn',
      'phone',
      'role',
    ]);
    expect(Object.keys(res.body.service).sort()).toEqual([
      'officer',
      'officerUserId',
      'responseCommitment',
      'termEnd',
      'termStart',
      'tier',
    ]);
  });

  it('an Administrator records the whole profile; it reads back, in the list too, and is audited before → after', async () => {
    const full = FULL();
    const res = await patch(ids.a, full).expect(200);
    const expected = {
      crNumber: CR_A,
      city: 'riyadh',
      sector: 'construction',
      nitaqat: full.nitaqat,
      registrations: full.registrations,
      contact: full.contact,
      signatories: full.signatories,
      portals: full.portals,
      service: {
        officerUserId: gro.userId,
        officer: { name: 'Tariq Al-Subaie', role: 'gro_officer' },
        tier: 'professional',
        responseCommitment: 'same_working_day',
        termStart: full.service.termStart,
        termEnd: full.service.termEnd,
      },
    };
    expect(res.body).toMatchObject(expected);
    expect(Object.keys(res.body.nitaqat).sort()).toEqual(['band', 'checkedOn']);

    const one = await http().get(`/clients/${ids.a}`).set('Cookie', auditor.cookie).expect(200);
    expect(one.body).toMatchObject(expected);
    const list = await http().get('/clients').set('Cookie', hr.cookie).expect(200);
    const mine = (list.body.clients as Array<{ id: string }>).find((c) => c.id === ids.a);
    expect(mine).toMatchObject(expected);

    const entry = await owner.auditEntry.findFirstOrThrow({
      where: { clientId: ids.a, resource: 'client', action: 'update' },
      orderBy: { id: 'desc' },
    });
    expect(entry.actorId).toBe(admin.userId);
    expect(entry.before).toMatchObject({ crNumber: null, nitaqatBand: null, portals: [] });
    expect(entry.after).toMatchObject({
      crNumber: CR_A,
      nitaqatBand: 'yellow',
      nitaqatCheckedOn: full.nitaqat.checkedOn,
      portals: ['qiwa', 'muqeem', 'gosi'],
      officerUserId: gro.userId,
    });
  });

  it('a partial change touches only what it names; null clears; a band is cleared with its date', async () => {
    const before = (await http().get(`/clients/${ids.a}`).set('Cookie', hr.cookie)).body;
    const res = await patch(ids.a, {
      contact: { phone: null },
      registrations: { vatNumber: null },
      service: { tier: 'enterprise' },
    }).expect(200);
    expect(res.body.contact).toEqual({ ...before.contact, phone: null });
    expect(res.body.registrations).toEqual({ ...before.registrations, vatNumber: null });
    expect(res.body.service).toEqual({ ...before.service, tier: 'enterprise' });
    expect(res.body.nitaqat).toEqual(before.nitaqat);
    expect(res.body.signatories).toEqual(before.signatories);

    const cleared = await patch(ids.a, { nitaqat: null, signatories: [], portals: [] }).expect(200);
    expect(cleared.body).toMatchObject({ nitaqat: null, signatories: [], portals: [] });
    const row = await owner.client.findUniqueOrThrow({ where: { id: ids.a } });
    expect(row).toMatchObject({ nitaqatBand: null, nitaqatCheckedOn: null });
    await patch(ids.a, { nitaqat: FULL().nitaqat, portals: ['qiwa'] }).expect(200);
  });

  it('refuses what is not valid (400) and changes nothing', async () => {
    const before = (await http().get(`/clients/${ids.a}`).set('Cookie', hr.cookie)).body;
    const bad: unknown[] = [
      { crNumber: '123456789' }, // nine digits
      { crNumber: '12345678901' },
      { city: 'atlantis' },
      { sector: 'crypto' },
      { nitaqat: { band: 'yellow' } }, // a band needs its checked-on date
      { nitaqat: { band: 'purple', checkedOn: day(-1) } },
      { nitaqat: { band: 'red', checkedOn: day(5) } }, // not in the future
      { nitaqat: { band: 'red', checkedOn: '2026-02-30' } }, // not a real date
      { registrations: { vatNumber: '31012244170000' } }, // fourteen digits
      { contact: { email: 'not-an-email' } },
      { contact: { phone: 'call me' } },
      { contact: { nameEn: '   ' } },
      { signatories: Array.from({ length: 11 }, (_, i) => ({ name: `N${i}`, role: 'R' })) },
      { signatories: [{ name: 'No role' }] },
      { portals: ['qiwa', 'qiwa'] },
      { portals: ['tawakkalna'] },
      { service: { tier: 'platinum' } },
      { service: { responseCommitment: 'whenever' } },
      { service: { termStart: day(10), termEnd: day(5) } },
      { service: { termEnd: day(-300) } }, // before the STORED start
      { nitaqatBand: 'red' }, // not a field — strict
      { service: { fee: 3500 } }, // money is not part of this
      { portals: [{ name: 'qiwa', password: 'x' }] }, // names only — never a credential
      {},
    ];
    for (const body of bad) {
      const res = await patch(ids.a, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    const after = (await http().get(`/clients/${ids.a}`).set('Cookie', hr.cookie)).body;
    expect(after).toEqual(before);
  });

  it('the named officer must be an active staff account that handles government work', async () => {
    await patch(ids.b, { service: { officerUserId: auditor.userId } }).expect(400);
    await patch(ids.b, { service: { officerUserId: repA.userId } }).expect(400);
    await patch(ids.b, {
      service: { officerUserId: '99999999-9999-4999-8999-999999999999' },
    }).expect(400);
    await patch(ids.b, { service: { officerUserId: hr.userId } }).expect(200);
    const res = await patch(ids.b, { service: { officerUserId: null } }).expect(200);
    expect(res.body.service).toMatchObject({ officerUserId: null, officer: null });
  });

  it('no two clients share a commercial registration (409); a client may be created with a profile', async () => {
    await patch(ids.b, { crNumber: CR_A }).expect(409);
    expect((await owner.client.findUniqueOrThrow({ where: { id: ids.b } })).crNumber).toBeNull();

    const cr = `20${String(Date.now()).slice(-8)}`;
    const created = await http()
      .post('/clients')
      .set('Cookie', admin.cookie)
      .send({
        name: { ar: 'جديدة', en: `${MARK} created` },
        crNumber: cr,
        city: 'jeddah',
        sector: 'healthcare',
        nitaqat: { band: 'platinum', checkedOn: day(0) },
        contact: { nameEn: 'Sara', email: 'sara@example.com' },
      })
      .expect(201);
    expect(created.body).toMatchObject({
      crNumber: cr,
      city: 'jeddah',
      sector: 'healthcare',
      nitaqat: { band: 'platinum', checkedOn: day(0) },
      contact: { nameEn: 'Sara', nameAr: null, email: 'sara@example.com' },
    });
    await http()
      .post('/clients')
      .set('Cookie', admin.cookie)
      .send({ name: { ar: 'مكررة', en: `${MARK} dup` }, crNumber: cr })
      .expect(409);
    expect(await owner.client.count({ where: { nameEn: `${MARK} dup` } })).toBe(0);
  });

  it('only an Administrator changes a profile: HR, GRO and the Auditor read it and are refused the change', async () => {
    for (const who of [hr, gro, auditor]) {
      await http().get(`/clients/${ids.a}`).set('Cookie', who.cookie).expect(200);
      await patch(ids.a, { city: 'abha' }, who).expect(403);
    }
    expect((await owner.client.findUniqueOrThrow({ where: { id: ids.a } })).city).toBe('riyadh');
  });

  it("a client manager reads their OWN company's profile through the portal — the officer by name, never an account id", async () => {
    const res = await http().get('/portal/company').set('Cookie', repA.cookie).expect(200);
    expect(Object.keys(res.body).sort()).toEqual(TOP_KEYS);
    expect(res.body).toMatchObject({
      id: ids.a,
      crNumber: CR_A,
      city: 'riyadh',
      nitaqat: { band: 'yellow' },
      contact: { nameEn: 'Hana Bin Turki' },
      portals: ['qiwa'],
      service: {
        officerUserId: null,
        officer: { name: 'Tariq Al-Subaie', role: 'gro_officer' },
        tier: 'enterprise',
      },
    });
    expect(JSON.stringify(res.body)).not.toContain(gro.userId);

    // The other company's manager gets THEIR company — never A's.
    const other = await http().get('/portal/company').set('Cookie', repB.cookie).expect(200);
    expect(other.body.id).toBe(ids.b);
    expect(JSON.stringify(other.body)).not.toContain(CR_A);
    // No staff path for them, and no way to change anything.
    await http().get(`/clients/${ids.a}`).set('Cookie', repA.cookie).expect(403);
    await patch(ids.a, { city: 'abha' }, repA).expect(403);

    // The portal switch governs it, like the rest of the portal.
    await owner.clientSetting.updateMany({
      where: { clientId: ids.a, key: FLAG },
      data: { value: false },
    });
    await http().get('/portal/company').set('Cookie', repA.cookie).expect(403);
  });

  it('an employee sees none of it', async () => {
    await http().get(`/clients/${ids.a}`).set('Cookie', employee.cookie).expect(403);
    await http().get('/clients').set('Cookie', employee.cookie).expect(403);
    await http().get('/portal/company').set('Cookie', employee.cookie).expect(403);
  });

  it('the database itself refuses a malformed row (the CHECKs are the last line)', async () => {
    const raw = (sql: string) => owner.$executeRawUnsafe(sql);
    const id = `'${ids.b}'::uuid`;
    await expect(
      raw(`UPDATE cli_clients SET cr_number = '12345' WHERE id = ${id}`),
    ).rejects.toThrow();
    await expect(
      raw(`UPDATE cli_clients SET vat_number = 'abc' WHERE id = ${id}`),
    ).rejects.toThrow();
    await expect(
      raw(`UPDATE cli_clients SET nitaqat_band = 'red' WHERE id = ${id}`), // no checked-on date
    ).rejects.toThrow();
    await expect(
      raw(
        `UPDATE cli_clients SET term_start = '2026-06-01', term_end = '2026-01-01' WHERE id = ${id}`,
      ),
    ).rejects.toThrow();
    await expect(
      raw(`UPDATE cli_clients SET signatories = '{"a":1}'::jsonb WHERE id = ${id}`), // not a list
    ).rejects.toThrow();
  });
});
