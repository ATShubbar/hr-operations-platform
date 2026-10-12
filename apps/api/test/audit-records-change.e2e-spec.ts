import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma/client';
import {
  auditCreated,
  auditEdit,
  auditValue,
  changedValues,
} from '../src/modules/audit/public-api';
import {
  cleanupHelperUsers,
  loginAsClientRep,
  loginAsEmployee,
  loginAsEnrolledStaff,
  loginAsStaff,
  type TestPrincipal,
} from './helpers/login';

// AUDIT-11 (ADR-022): an edit's audit entry says WHAT CHANGED, from what to what.
//
// The inventory: every audited edit route, and every field it lets a person
// change. Each field is set twice through the API — to A, then to B — and the
// entry written by the second edit must hold a field whose value was A before
// and is B after. A route that records "nothing changed" for a real change fails
// here, whichever module owns it.

const MARK = 'AUDIT-11';
const db = () =>
  new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }) });

type Json = Record<string, unknown> | null;
const obj = (v: unknown): Json =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

/** An edit of one field: the request bodies that set it to A and to B, and how each value reads in the entry. */
interface Edit {
  field: string;
  a: unknown;
  b: unknown;
  /** The text to look for, when the stored form differs from the request's. */
  showA?: string;
  showB?: string;
  /** The whole body, when the field does not sit at the top of it. */
  body?: (value: unknown) => Record<string, unknown>;
}

describe('What an edit changed — the rule (AUDIT-11)', () => {
  const decimal = (n: number) => ({ toNumber: () => n, toString: () => String(n) });
  const before = {
    id: 'r1',
    nameEn: 'Sara',
    jobTitleEn: 'Clerk',
    department: 'Ops',
    basicSalary: decimal(5000),
    iqamaExpiry: new Date('2027-01-01T00:00:00.000Z'),
    endDate: null as Date | null,
    updatedAt: new Date('2026-01-01T10:00:00.000Z'),
  };
  const after = {
    ...before,
    jobTitleEn: 'Accountant',
    basicSalary: decimal(6500.5),
    iqamaExpiry: new Date('2028-01-01T00:00:00.000Z'),
    endDate: new Date('2029-03-03T00:00:00.000Z'),
    updatedAt: new Date('2026-02-02T11:00:00.000Z'),
  };

  it('holds every changed field, old and new — and nothing that did not change', () => {
    expect(changedValues(before, after)).toEqual({
      before: { jobTitleEn: 'Clerk', basicSalary: 5000, iqamaExpiry: '2027-01-01', endDate: null },
      after: {
        jobTitleEn: 'Accountant',
        basicSalary: 6500.5,
        iqamaExpiry: '2028-01-01',
        endDate: '2029-03-03',
      },
    });
  });

  it('records a day as a day, an instant as an instant, an amount as a number', () => {
    expect(auditValue(new Date('2027-01-01T00:00:00.000Z'))).toBe('2027-01-01');
    expect(auditValue(new Date('2027-01-01T08:30:00.000Z'))).toBe('2027-01-01T08:30:00.000Z');
    expect(auditValue(decimal(1234.5))).toBe(1234.5);
    expect(auditValue(undefined)).toBeNull();
    expect(auditValue(['qiwa', 'gosi'])).toEqual(['qiwa', 'gosi']);
  });

  it('never counts the record\u2019s own bookkeeping as a change', () => {
    const changed = changedValues(before, after);
    expect(Object.keys(changed.after)).not.toContain('updatedAt');
    expect(Object.keys(changed.after)).not.toContain('id');
  });

  it('an edit\u2019s entry: what names the record on both sides, plus the changes', () => {
    const entry = auditEdit(before, after, (r) => ({ nameEn: r.nameEn }));
    expect(entry.before).toEqual({
      nameEn: 'Sara',
      jobTitleEn: 'Clerk',
      basicSalary: 5000,
      iqamaExpiry: '2027-01-01',
      endDate: null,
    });
    expect(entry.after).toMatchObject({
      nameEn: 'Sara',
      jobTitleEn: 'Accountant',
      endDate: '2029-03-03',
    });
  });

  it('leaves out the fields a caller asks it to', () => {
    expect(Object.keys(changedValues(before, after, ['basicSalary']).after)).not.toContain(
      'basicSalary',
    );
  });

  it('a new record: every field that holds a value, none that is empty', () => {
    expect(auditCreated(before, (r) => ({ nameEn: r.nameEn }))).toEqual({
      nameEn: 'Sara',
      jobTitleEn: 'Clerk',
      department: 'Ops',
      basicSalary: 5000,
      iqamaExpiry: '2027-01-01',
    });
  });
});

describe('An edit records what changed, old and new (AUDIT-11, e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let admin: TestPrincipal;
  let other: TestPrincipal;
  let clientId: string;
  let employeeId: string;
  const made: { staffUsers: string[]; clients: string[] } = { staffUsers: [], clients: [] };

  const call = (method: 'patch' | 'put' | 'post', path: string, body: unknown) => {
    const http = request(app.getHttpServer());
    const sent =
      method === 'patch' ? http.patch(path) : method === 'put' ? http.put(path) : http.post(path);
    return sent.set('Cookie', admin.cookie).send(body as object);
  };
  const post = async (path: string, body: unknown): Promise<Record<string, unknown>> => {
    const res = await call('post', path, body);
    expect([200, 201], `${path}: ${res.status} ${res.text}`).toContain(res.status);
    return res.body as Record<string, unknown>;
  };
  const lastId = async () =>
    (await owner.auditEntry.findFirst({ orderBy: { id: 'desc' }, select: { id: true } }))?.id ?? 0n;

  /** Set each field to A, then to B, and require the second entry to show A → B. */
  async function inventory(
    route: { method: 'patch' | 'put'; path: string; resource: string },
    edits: Edit[],
  ): Promise<string[]> {
    const missing: string[] = [];
    for (const e of edits) {
      const wrap = e.body ?? ((v: unknown) => ({ [e.field]: v }));
      const first = await call(route.method, route.path, wrap(e.a));
      expect([200, 204], `${route.path} ${e.field}=A: ${first.status} ${first.text}`).toContain(
        first.status,
      );
      const mark = await lastId();
      const second = await call(route.method, route.path, wrap(e.b));
      expect([200, 204], `${route.path} ${e.field}=B: ${second.status} ${second.text}`).toContain(
        second.status,
      );

      const entry = await owner.auditEntry.findFirst({
        where: { id: { gt: mark }, resource: route.resource, actorId: admin.userId },
        orderBy: { id: 'desc' },
      });
      const before = obj(entry?.before);
      const after = obj(entry?.after);
      const showA = e.showA ?? String(e.a);
      const showB = e.showB ?? String(e.b);
      const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
      const shown = keys.some(
        (k) =>
          JSON.stringify(before?.[k] ?? null) !== JSON.stringify(after?.[k] ?? null) &&
          JSON.stringify(before?.[k] ?? null).includes(showA) &&
          JSON.stringify(after?.[k] ?? null).includes(showB),
      );
      if (!shown) missing.push(e.field);
    }
    return missing;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    owner = db();
    admin = await loginAsEnrolledStaff(app, 'administrator');
    other = await loginAsStaff(app, 'gro_officer');
    clientId = (await owner.client.create({ data: { nameAr: 'شركة', nameEn: `${MARK} co` } })).id;
    made.clients.push(clientId);
    const emp = await post('/employees', {
      clientId,
      name: { en: `${MARK} person`, ar: 'شخص' },
      nationality: 'IN',
      contractType: 'unlimited',
    });
    employeeId = emp.id as string;
  });

  afterAll(async () => {
    await owner.auditEntry.deleteMany({ where: { actorId: admin.userId } });
    await owner.auditEntry.deleteMany({ where: { clientId: { in: made.clients } } });
    for (const table of [
      'bil_fees',
      'bil_invoices',
      'bil_terms',
      'gro_processes',
      'rec_candidates',
      'rec_vacancies',
      'task_tasks',
      'req_requests',
    ]) {
      await owner.$executeRawUnsafe(
        `DELETE FROM ${table} WHERE client_id = ANY($1::uuid[])`,
        made.clients,
      );
    }
    await owner.calendarEvent.deleteMany({ where: { ownerUserId: admin.userId } });
    await owner.gcalInvitation
      .deleteMany({ where: { createdByUserId: admin.userId } })
      .catch(() => undefined);
    await owner.dependant.deleteMany({ where: { employeeId } });
    await owner.employee.deleteMany({ where: { clientId: { in: made.clients } } });
    await owner.clientSetting.deleteMany({ where: { clientId: { in: made.clients } } });
    await owner.systemSetting.deleteMany({ where: { key: 'leave.service-level-days' } });
    await owner.authUser.deleteMany({ where: { id: { in: made.staffUsers } } });
    await cleanupHelperUsers(app);
    await owner.client.deleteMany({ where: { id: { in: made.clients } } });
    await owner.$disconnect();
    await app.close();
  });

  it('an employee: every profile field', async () => {
    const missing = await inventory(
      { method: 'patch', path: `/employees/${employeeId}`, resource: 'employee' },
      [
        {
          field: 'name',
          a: { en: 'Inv Aaa', ar: 'ألف' },
          b: { en: 'Inv Bbb', ar: 'باء' },
          showA: 'Inv Aaa',
          showB: 'Inv Bbb',
        },
        { field: 'nationality', a: 'IN', b: 'PK' },
        { field: 'contractType', a: 'unlimited', b: 'part_time' },
        { field: 'gender', a: 'male', b: 'female' },
        { field: 'dateOfBirth', a: '1990-05-05', b: '1991-06-06' },
        { field: 'jobTitleAr', a: 'كاتب', b: 'محاسب' },
        { field: 'jobTitleEn', a: 'Clerk', b: 'Accountant' },
        { field: 'department', a: 'Operations', b: 'Finance' },
        { field: 'hireDate', a: '2024-01-10', b: '2024-02-11' },
        { field: 'employmentStatus', a: 'active', b: 'on_leave' },
        { field: 'contractEndDate', a: '2027-03-03', b: '2028-04-04' },
        { field: 'countsTowardSaudization', a: true, b: false },
      ],
    );
    expect(missing).toEqual([]);
  });

  it('an employee: every pay field, with its values (owner decision)', async () => {
    const missing = await inventory(
      { method: 'patch', path: `/employees/${employeeId}/salary`, resource: 'employee' },
      [
        { field: 'currency', a: 'SAR', b: 'USD' },
        { field: 'basicSalary', a: 5123, b: 6234 },
        { field: 'housingAllowance', a: 1111, b: 1222 },
        { field: 'transportAllowance', a: 333, b: 444 },
        { field: 'otherAllowances', a: 155, b: 166 },
        { field: 'gosiWage', a: 4321, b: 4567 },
        { field: 'gosiContributionBasis', a: 'basic', b: 'basic_plus_housing' },
        { field: 'bankIban', a: 'SA0380000000608010167519', b: 'SA4420000001234567891234' },
        { field: 'wpsStatus', a: 'compliant', b: 'pending' },
      ],
    );
    expect(missing).toEqual([]);
  });

  it('an employee: every ID number and date, with its values (owner decision)', async () => {
    const missing = await inventory(
      { method: 'patch', path: `/employees/${employeeId}/govdata`, resource: 'employee' },
      [
        { field: 'iqamaNumber', a: '2111111111', b: '2222222222' },
        { field: 'nationalId', a: '1111111111', b: '1222222222' },
        { field: 'borderNumber', a: '3111111111', b: '3222222222' },
        { field: 'passportNumber', a: 'P1111111', b: 'P2222222' },
        { field: 'workPermitNumber', a: 'WP-111', b: 'WP-222' },
        { field: 'gosiRegistrationNumber', a: 'G-111', b: 'G-222' },
        { field: 'absherServiceRef', a: 'AB-111', b: 'AB-222' },
        { field: 'medicalInsuranceNumber', a: 'MI-111', b: 'MI-222' },
        { field: 'drivingLicenceNumber', a: 'DL-111', b: 'DL-222' },
        { field: 'iqamaExpiry', a: '2027-01-01', b: '2028-01-01' },
        { field: 'passportExpiry', a: '2029-02-02', b: '2030-02-02' },
        { field: 'workPermitExpiry', a: '2027-03-03', b: '2028-03-03' },
        { field: 'exitReentryStatus', a: 'single', b: 'multiple' },
        { field: 'exitReentryExpiry', a: '2027-04-04', b: '2027-05-05' },
        { field: 'gosiRegistrationStatus', a: 'registered', b: 'pending' },
        { field: 'medicalInsuranceExpiry', a: '2027-06-06', b: '2028-06-06' },
        { field: 'drivingLicenceExpiry', a: '2031-07-07', b: '2032-07-07' },
      ],
    );
    expect(missing).toEqual([]);
  });

  it('a dependant: every field, with its values (ADR-017 revised)', async () => {
    const dep = await post(`/employees/${employeeId}/dependants`, {
      relationship: 'son',
      nameEn: `${MARK} child`,
    });
    const missing = await inventory(
      {
        method: 'patch',
        path: `/employees/${employeeId}/dependants/${String(dep.id)}`,
        resource: 'dependant',
      },
      [
        { field: 'relationship', a: 'son', b: 'daughter' },
        { field: 'nameEn', a: 'Dep Aaa', b: 'Dep Bbb' },
        { field: 'nameAr', a: 'ابن', b: 'ابنة' },
        { field: 'dateOfBirth', a: '2015-05-05', b: '2016-06-06' },
        { field: 'iqamaNumber', a: '2311111111', b: '2322222222' },
        { field: 'iqamaExpiry', a: '2027-01-01', b: '2028-01-01' },
        { field: 'passportExpiry', a: '2029-02-02', b: '2030-02-02' },
        { field: 'insuranceExpiry', a: '2027-03-03', b: '2028-03-03' },
      ],
    );
    expect(missing).toEqual([]);
  });

  it('a candidate and a vacancy: every field', async () => {
    const vacancy = await post('/vacancies', {
      clientId,
      title: { en: `${MARK} role`, ar: 'وظيفة' },
    });
    const candidate = await post('/candidates', {
      vacancyId: vacancy.id,
      name: { en: `${MARK} cand`, ar: 'مرشح' },
    });
    expect(
      await inventory(
        { method: 'patch', path: `/candidates/${String(candidate.id)}`, resource: 'candidate' },
        [
          {
            field: 'name',
            a: { en: 'Cand Aaa', ar: 'ألف' },
            b: { en: 'Cand Bbb', ar: 'باء' },
            showA: 'Cand Aaa',
            showB: 'Cand Bbb',
          },
          { field: 'nationality', a: 'IN', b: 'PK' },
          { field: 'email', a: 'aaa@example.com', b: 'bbb@example.com' },
          { field: 'phone', a: '+966500000001', b: '+966500000002' },
          { field: 'cvDocumentId', a: randomUUID(), b: randomUUID() },
          { field: 'notes', a: 'Note Aaa', b: 'Note Bbb' },
          { field: 'targetDate', a: '2026-12-01', b: '2026-12-15' },
        ],
      ),
    ).toEqual([]);
    expect(
      await inventory(
        { method: 'patch', path: `/vacancies/${String(vacancy.id)}`, resource: 'vacancy' },
        [
          {
            field: 'title',
            a: { en: 'Role Aaa', ar: 'ألف' },
            b: { en: 'Role Bbb', ar: 'باء' },
            showA: 'Role Aaa',
            showB: 'Role Bbb',
          },
          { field: 'description', a: 'Desc Aaa', b: 'Desc Bbb' },
          { field: 'department', a: 'Dept Aaa', b: 'Dept Bbb' },
          { field: 'headcount', a: 3, b: 5 },
        ],
      ),
    ).toEqual([]);
  });

  it('a request, a task and a procedure: every field', async () => {
    const req = await post('/requests', { clientId, type: 'general', title: `${MARK} request` });
    expect(
      await inventory(
        { method: 'patch', path: `/requests/${String(req.id)}`, resource: 'request' },
        [
          { field: 'title', a: 'Req Aaa', b: 'Req Bbb' },
          { field: 'description', a: 'Desc Aaa', b: 'Desc Bbb' },
          { field: 'priority', a: 'low', b: 'high' },
          { field: 'dueDate', a: '2027-01-11', b: '2027-02-12' },
        ],
      ),
    ).toEqual([]);
    const task = await post('/tasks', { clientId, title: `${MARK} task` });
    expect(
      await inventory({ method: 'patch', path: `/tasks/${String(task.id)}`, resource: 'task' }, [
        { field: 'title', a: 'Task Aaa', b: 'Task Bbb' },
        { field: 'description', a: 'Desc Aaa', b: 'Desc Bbb' },
        { field: 'status', a: 'open', b: 'in_progress' },
        { field: 'priority', a: 'low', b: 'high' },
        { field: 'assigneeUserId', a: admin.userId, b: other.userId },
        { field: 'dueDate', a: '2027-01-11', b: '2027-02-12' },
      ]),
    ).toEqual([]);
    const proc = await post('/gro-processes', { employeeId, type: 'iqama_renewal' });
    expect(
      await inventory(
        { method: 'patch', path: `/gro-processes/${String(proc.id)}`, resource: 'gro-process' },
        [
          { field: 'referenceNumber', a: 'REF-Aaa', b: 'REF-Bbb' },
          { field: 'dueDate', a: '2027-01-11', b: '2027-02-12' },
          { field: 'resultingExpiry', a: '2028-01-11', b: '2028-02-12' },
          { field: 'assigneeUserId', a: admin.userId, b: other.userId },
          { field: 'notes', a: 'Note Aaa', b: 'Note Bbb' },
        ],
      ),
    ).toEqual([]);
  });

  it('a client, and the accounts: every field', async () => {
    const cr = () => `10${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
    expect(
      await inventory({ method: 'patch', path: `/clients/${clientId}`, resource: 'client' }, [
        {
          field: 'name',
          a: { en: `${MARK} Aaa`, ar: 'ألف' },
          b: { en: `${MARK} Bbb`, ar: 'باء' },
          showA: 'Aaa',
          showB: 'Bbb',
        },
        { field: 'crNumber', a: cr(), b: cr() },
        { field: 'city', a: 'riyadh', b: 'jeddah' },
        { field: 'sector', a: 'construction', b: 'wholesale_retail' },
        { field: 'portals', a: ['qiwa'], b: ['qiwa', 'gosi'], showA: 'qiwa', showB: 'gosi' },
      ]),
    ).toEqual([]);

    const staff = await post('/staff-users', {
      email: `audit11-${randomUUID()}@e2e.test`,
      password: 'Inventory-pass-1',
      role: 'hr_officer',
    });
    made.staffUsers.push(staff.id as string);
    expect(
      await inventory(
        { method: 'patch', path: `/staff-users/${String(staff.id)}`, resource: 'staff-user' },
        [
          { field: 'displayName', a: 'Staff Aaa', b: 'Staff Bbb' },
          { field: 'role', a: 'hr_officer', b: 'gro_officer' },
          { field: 'status', a: 'active', b: 'disabled' },
        ],
      ),
    ).toEqual([]);

    const rep = await loginAsClientRep(app, clientId, 'client_manager');
    expect(
      await inventory(
        {
          method: 'patch',
          path: `/clients/${clientId}/users/${rep.userId}`,
          resource: 'client-user',
        },
        [{ field: 'status', a: 'active', b: 'disabled' }],
      ),
    ).toEqual([]);

    await loginAsEmployee(app, employeeId);
    expect(
      await inventory(
        { method: 'patch', path: `/employee-accounts/${employeeId}`, resource: 'employee-user' },
        [{ field: 'status', a: 'active', b: 'disabled' }],
      ),
    ).toEqual([]);
  });

  it('billing: a fee, an invoice record and the commercial terms', async () => {
    const fee = await post('/fees', {
      source: { kind: 'manual', clientId, label: 'Fee Aaa' },
      authority: 'qiwa',
      amountHalalas: 10000,
      paidOn: '2026-09-01',
    });
    expect(
      await inventory({ method: 'patch', path: `/fees/${String(fee.id)}`, resource: 'fee' }, [
        { field: 'amountHalalas', a: 12300, b: 45600 },
        { field: 'paidOn', a: '2026-09-02', b: '2026-09-03' },
        { field: 'authority', a: 'qiwa', b: 'gosi' },
        { field: 'label', a: 'Fee Aaa', b: 'Fee Bbb' },
      ]),
    ).toEqual([]);

    const invoice = await post(`/billing/clients/${clientId}/invoices`, {
      number: `INV-${randomUUID().slice(0, 8)}`,
      issuedOn: '2026-09-01',
      dueOn: '2026-10-01',
      amountHalalas: 500000,
    });
    expect(
      await inventory(
        { method: 'patch', path: `/billing/invoices/${String(invoice.id)}`, resource: 'invoice' },
        [
          {
            field: 'number',
            a: `INV-A-${randomUUID().slice(0, 6)}`,
            b: `INV-B-${randomUUID().slice(0, 6)}`,
          },
          { field: 'issuedOn', a: '2026-09-02', b: '2026-09-03' },
          { field: 'dueOn', a: '2026-10-02', b: '2026-10-03' },
          { field: 'amountHalalas', a: 511100, b: 522200 },
        ],
      ),
    ).toEqual([]);

    const terms = {
      platformFeeHalalas: 100000,
      seatRateHalalas: 5000,
      cycle: 'monthly',
      poNumber: 'PO-0',
      paymentTermsDays: 30,
    };
    const whole = (field: string) => (value: unknown) => ({ ...terms, [field]: value });
    expect(
      await inventory(
        { method: 'put', path: `/billing/clients/${clientId}/terms`, resource: 'billing-terms' },
        [
          { field: 'platformFeeHalalas', a: 111100, b: 222200, body: whole('platformFeeHalalas') },
          { field: 'seatRateHalalas', a: 5100, b: 5200, body: whole('seatRateHalalas') },
          { field: 'poNumber', a: 'PO-Aaa', b: 'PO-Bbb', body: whole('poNumber') },
          { field: 'paymentTermsDays', a: 31, b: 45, body: whole('paymentTermsDays') },
        ],
      ),
    ).toEqual([]);
  });

  it('the calendar and a Google Calendar invitation', async () => {
    const event = await post('/calendar/events', {
      title: `${MARK} event`,
      startAt: '2027-01-11T08:00:00.000Z',
      endAt: '2027-01-11T09:00:00.000Z',
    });
    expect(
      await inventory(
        {
          method: 'patch',
          path: `/calendar/events/${String(event.id)}`,
          resource: 'calendar-event',
        },
        [
          { field: 'title', a: 'Event Aaa', b: 'Event Bbb' },
          { field: 'description', a: 'Desc Aaa', b: 'Desc Bbb' },
          { field: 'location', a: 'Room Aaa', b: 'Room Bbb' },
          {
            field: 'endAt',
            a: '2027-01-11T10:00:00.000Z',
            b: '2027-01-11T11:00:00.000Z',
            showA: '10:00',
            showB: '11:00',
          },
          { field: 'allDay', a: false, b: true },
        ],
      ),
    ).toEqual([]);

    const invitation = {
      kind: 'interview',
      start: '2027-01-11T08:00:00.000Z',
      end: '2027-01-11T09:00:00.000Z',
      timezone: 'Asia/Riyadh',
      personName: 'Inv Person',
      jobTitle: 'Clerk',
      referenceCode: 'REF-1',
      location: 'Room 0',
      attendeeEmails: ['a@example.com'],
    };
    const inv = await post('/integrations/google-calendar/invitations', invitation);
    const all = (field: string) => (value: unknown) => ({ ...invitation, [field]: value });
    expect(
      await inventory(
        {
          method: 'patch',
          path: `/integrations/google-calendar/invitations/${String(inv.id)}`,
          resource: 'gcal-invitation',
        },
        [
          { field: 'location', a: 'Room Aaa', b: 'Room Bbb', body: all('location') },
          { field: 'jobTitle', a: 'Title Aaa', b: 'Title Bbb', body: all('jobTitle') },
        ],
      ),
    ).toEqual([]);
  });

  it('settings, at each level, and a notification preference', async () => {
    const value = (v: unknown) => ({ value: v });
    expect(
      await inventory(
        { method: 'patch', path: '/config/system/leave.service-level-days', resource: 'config' },
        [{ field: 'value', a: 3, b: 4, body: value }],
      ),
    ).toEqual([]);
    expect(
      await inventory(
        {
          method: 'patch',
          path: `/config/client/${clientId}/flag.client-self-service`,
          resource: 'config',
        },
        [{ field: 'value', a: true, b: false, body: value }],
      ),
    ).toEqual([]);
    expect(
      await inventory({ method: 'patch', path: '/config/me/ui.language', resource: 'config' }, [
        { field: 'value', a: 'en', b: 'ar', body: value },
      ]),
    ).toEqual([]);
    expect(
      await inventory(
        { method: 'patch', path: '/notifications/preferences/task', resource: 'notification-pref' },
        [{ field: 'emailEnabled', a: true, b: false }],
      ),
    ).toEqual([]);
  });
});
