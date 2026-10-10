import { DEFAULT_ESCALATION_THRESHOLDS, type EscalationItem } from '@hr/contracts';
import { describe, expect, it } from 'vitest';
import {
  buildLadder,
  type LadderInput,
  type LadderViewer,
} from '../src/modules/escalations/public-api';

// NC-01 (ADR-021): the escalation ladder, worked out for one viewer. Pure —
// no database. Each rule of the ADR has its own test here; the API spec proves
// the wiring.
const TODAY = '2026-10-10';
const day = (offset: number): string => {
  const d = new Date(`${TODAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

const CO = 'c0000000-0000-4000-8000-000000000001';
const OTHER = 'c0000000-0000-4000-8000-000000000002';
const ARCHIVED = 'c0000000-0000-4000-8000-000000000003';
const P1 = 'e0000000-0000-4000-8000-000000000001';
const P2 = 'e0000000-0000-4000-8000-000000000002';
const GRO_1 = 'a0000000-0000-4000-8000-000000000001';
const GRO_2 = 'a0000000-0000-4000-8000-000000000002';
const HR_1 = 'a0000000-0000-4000-8000-000000000003';
const ADMIN = 'a0000000-0000-4000-8000-000000000004';
const AUDITOR = 'a0000000-0000-4000-8000-000000000005';

const STAFF = ['employee.read', 'govdata.read', 'gro.read', 'task.read', 'request.read'];
const viewer = (userId: string, role: string, perms: readonly string[] = STAFF): LadderViewer => ({
  userId,
  role,
  can: (p) => perms.includes(p),
});
const gro1 = viewer(GRO_1, 'gro_officer');
const gro2 = viewer(GRO_2, 'gro_officer');
const hr = viewer(HR_1, 'hr_officer');
const admin = viewer(ADMIN, 'administrator');
const auditor = viewer(AUDITOR, 'auditor');

const person = (over: Partial<LadderInput['people'][number]> = {}) => ({
  id: P1,
  clientId: CO,
  name: { ar: 'أحمد', en: 'Ahmed' },
  nationality: 'IN',
  employmentStatus: 'active',
  dates: {},
  ...over,
});
const base = (over: Partial<LadderInput> = {}): LadderInput => ({
  today: TODAY,
  thresholds: DEFAULT_ESCALATION_THRESHOLDS,
  clients: [
    { id: CO, name: { ar: 'شركة', en: 'Company' }, status: 'active', officerUserId: null },
    { id: OTHER, name: { ar: 'أخرى', en: 'Other' }, status: 'active', officerUserId: GRO_2 },
    {
      id: ARCHIVED,
      name: { ar: 'مؤرشفة', en: 'Archived' },
      status: 'inactive',
      officerUserId: null,
    },
  ],
  people: [],
  dependants: [],
  procedures: [],
  tasks: [],
  requests: [],
  names: new Map([
    [GRO_1, 'Turki'],
    [GRO_2, 'Salman'],
    [HR_1, 'Omar'],
  ]),
  ...over,
});
const keys = (items: EscalationItem[]) => items.map((i) => i.key);
const one = (input: LadderInput, who: LadderViewer, key: string): EscalationItem | undefined =>
  buildLadder(input, who).items.find((i) => i.key === key);

describe('document expiry', () => {
  it('shows each dated document at the highest stage it has reached, and nothing still outside its window', () => {
    const input = base({
      people: [
        person({
          dates: {
            iqama: day(-3), // lapsed
            work_permit: day(7), // escalated
            passport: day(14), // reminder
            contract: day(45), // outside the 30-day window
          },
        }),
        person({ id: P2, dates: { iqama: day(30) } }), // notice
      ],
    });
    const items = buildLadder(input, admin).items;
    expect(items.map((i) => [i.key, i.stage, i.daysLeft])).toEqual([
      [`expiry:${P1}:iqama`, 'breach', -3],
      [`expiry:${P1}:work_permit`, 'escalation', 7],
      [`expiry:${P1}:passport`, 'reminder', 14],
      [`expiry:${P2}:iqama`, 'notice', 30],
    ]);
    expect(items[0]).toMatchObject({
      rule: 'expiry',
      dueOn: day(-3),
      subject: { kind: 'document', doc: 'iqama', employee: { id: P1, name: { en: 'Ahmed' } } },
      client: { id: CO, name: { en: 'Company' } },
    });
  });

  it('watches only people under management: not leavers, arrivals, or an archived company', () => {
    const dates = { passport: day(-1) };
    const input = base({
      people: [
        person({ id: P1, employmentStatus: 'terminated', dates }),
        person({ id: P2, employmentStatus: 'onboarding', dates }),
        person({ id: 'e0000000-0000-4000-8000-000000000003', clientId: ARCHIVED, dates }),
        person({ id: 'e0000000-0000-4000-8000-000000000004', employmentStatus: 'on_leave', dates }),
      ],
    });
    expect(keys(buildLadder(input, admin).items)).toEqual([
      'expiry:e0000000-0000-4000-8000-000000000004:passport',
    ]);
  });

  it('a Saudi national has no iqama or work permit to expire', () => {
    const input = base({
      people: [
        person({
          nationality: 'SA',
          dates: { iqama: day(-1), work_permit: day(-1), passport: day(-1), contract: day(-1) },
        }),
      ],
    });
    expect(keys(buildLadder(input, admin).items).sort()).toEqual([
      `expiry:${P1}:contract`,
      `expiry:${P1}:passport`,
    ]);
  });

  it('includes the dependants of a watched person, and none of a leaver', () => {
    const DEP = 'd0000000-0000-4000-8000-000000000001';
    const input = base({
      people: [person(), person({ id: P2, employmentStatus: 'terminated' })],
      dependants: [
        {
          id: DEP,
          employeeId: P1,
          name: { ar: 'ياسمين', en: 'Yasmin' },
          dates: { iqama: day(5), passport: day(200), insurance: day(-2) },
        },
        {
          id: 'd0000000-0000-4000-8000-000000000002',
          employeeId: P2,
          name: { ar: null, en: 'X' },
          dates: { iqama: day(-9) },
        },
      ],
    });
    const items = buildLadder(input, admin).items;
    expect(items.map((i) => [i.key, i.stage])).toEqual([
      [`dependant:${DEP}:insurance`, 'breach'],
      [`dependant:${DEP}:iqama`, 'escalation'],
    ]);
    expect(items[1]?.subject).toEqual({
      kind: 'dependant_document',
      doc: 'iqama',
      dependant: { id: DEP, name: { ar: 'ياسمين', en: 'Yasmin' } },
      employee: { id: P1, name: { ar: 'أحمد', en: 'Ahmed' } },
    });
    expect(items[1]?.client?.id).toBe(CO);
  });

  it('stays quiet while a procedure that renews the document is open — and says how many are quiet', () => {
    const proc = (over: object) => ({
      id: 'f0000000-0000-4000-8000-000000000001',
      employeeId: P1,
      clientId: CO,
      type: 'iqama_renewal',
      status: 'in_progress',
      dueOn: null,
      assigneeUserId: null,
      ...over,
    });
    const people = [person({ dates: { iqama: day(3), work_permit: day(3), passport: day(3) } })];
    const quiet = buildLadder(base({ people, procedures: [proc({})] }), admin);
    expect(keys(quiet.items).sort()).toEqual([`expiry:${P1}:passport`, `expiry:${P1}:work_permit`]);
    expect(quiet.suppressed).toBe(1);

    // A rejected procedure is still open (it is retried); a finished one is not.
    expect(
      buildLadder(base({ people, procedures: [proc({ status: 'rejected' })] }), admin).suppressed,
    ).toBe(1);
    for (const status of ['completed', 'cancelled']) {
      const res = buildLadder(base({ people, procedures: [proc({ status })] }), admin);
      expect(keys(res.items), status).toContain(`expiry:${P1}:iqama`);
      expect(res.suppressed, status).toBe(0);
    }
    // Another person's renewal, or a procedure that renews something else, changes nothing.
    for (const other of [proc({ employeeId: P2 }), proc({ type: 'exit_reentry' })]) {
      expect(keys(buildLadder(base({ people, procedures: [other] }), admin).items)).toContain(
        `expiry:${P1}:iqama`,
      );
    }
    // A work-permit renewal quiets the work permit, not the iqama.
    const permit = buildLadder(
      base({ people, procedures: [proc({ type: 'work_permit_renewal' })] }),
      admin,
    );
    expect(keys(permit.items).sort()).toEqual([`expiry:${P1}:iqama`, `expiry:${P1}:passport`]);
    // An expiry still outside its window is not "quiet": there was nothing to say.
    const early = [person({ dates: { iqama: day(90) } })];
    expect(buildLadder(base({ people: early, procedures: [proc({})] }), admin).suppressed).toBe(0);
  });
});

describe('who owns an expiry, and who is told', () => {
  const lapsing = (days: number, clientId = CO) =>
    base({ people: [person({ clientId, dates: { iqama: day(days), contract: day(days) } })] });

  it("the client's named officer owns it; with none, the role that keeps that kind of document", () => {
    // OTHER names GRO_2 as its officer: every expiry there is that one person's.
    const named = lapsing(20, OTHER);
    const iqama = one(named, gro2, `expiry:${P1}:iqama`);
    expect(iqama).toMatchObject({
      owner: { kind: 'person', name: 'Salman' },
      mine: true,
      told: true,
    });
    expect(one(named, gro2, `expiry:${P1}:contract`)).toMatchObject({ mine: true, told: true });
    // Another GRO officer may read it, but it is not theirs and Notice does not tell them.
    expect(one(named, gro1, `expiry:${P1}:iqama`)).toMatchObject({ mine: false, told: false });

    // CO has no named officer: the iqama is every GRO officer's, the contract every HR officer's.
    const byType = lapsing(20);
    expect(one(byType, gro1, `expiry:${P1}:iqama`)).toMatchObject({
      owner: { kind: 'role', role: 'gro_officer' },
      mine: true,
      told: true,
    });
    expect(one(byType, gro1, `expiry:${P1}:contract`)).toMatchObject({
      owner: { kind: 'role', role: 'hr_officer' },
      mine: false,
      told: false,
    });
    expect(one(byType, hr, `expiry:${P1}:contract`)).toMatchObject({ mine: true, told: true });
  });

  it('each stage widens the circle: owner, then HR officers, then Administrators', () => {
    const told = (days: number, who: LadderViewer) =>
      one(lapsing(days, OTHER), who, `expiry:${P1}:iqama`)?.told;
    // Notice (20 days): the owner only.
    expect([told(20, gro2), told(20, hr), told(20, admin)]).toEqual([true, false, false]);
    // Reminder (10 days): + HR officers.
    expect([told(10, gro2), told(10, hr), told(10, admin)]).toEqual([true, true, false]);
    // Escalated (5 days) and Breach: + Administrators.
    expect([told(5, gro2), told(5, hr), told(5, admin)]).toEqual([true, true, true]);
    expect([told(-1, gro2), told(-1, hr), told(-1, admin)]).toEqual([true, true, true]);
    // A GRO officer who is not the owner is never told, at any stage — but still reads it.
    for (const d of [20, 10, 5, -1]) {
      expect(one(lapsing(d, OTHER), gro1, `expiry:${P1}:iqama`)).toMatchObject({
        told: false,
        mine: false,
      });
    }
  });

  it('the Auditor reads everything and is told nothing', () => {
    const items = buildLadder(lapsing(-1, OTHER), auditor).items;
    expect(items).toHaveLength(2);
    expect(items.every((i) => !i.told && !i.mine)).toBe(true);
  });
});

describe('queue deadlines', () => {
  const proc = (over: object = {}) => ({
    id: 'f0000000-0000-4000-8000-000000000001',
    employeeId: P1,
    clientId: CO,
    type: 'exit_reentry',
    status: 'in_progress',
    dueOn: day(1),
    assigneeUserId: GRO_1,
    ...over,
  });
  const task = (over: object = {}) => ({
    id: 'b0000000-0000-4000-8000-000000000001',
    title: 'Prepare the salary certificate',
    clientId: CO,
    status: 'open',
    dueOn: day(-2),
    assigneeUserId: HR_1,
    requestId: null,
    ...over,
  });

  it('lists open procedures and tasks that have a date, owned by their assignee', () => {
    const input = base({ people: [person()], procedures: [proc()], tasks: [task()] });
    const items = buildLadder(input, admin).items;
    expect(items.map((i) => [i.key, i.rule, i.stage])).toEqual([
      ['task:b0000000-0000-4000-8000-000000000001', 'queue', 'breach'],
      ['procedure:f0000000-0000-4000-8000-000000000001', 'queue', 'escalation'],
    ]);
    expect(items[1]).toMatchObject({
      subject: { kind: 'procedure', type: 'exit_reentry', employee: { id: P1 } },
      owner: { kind: 'person', name: 'Turki' },
    });
    expect(one(input, gro1, items[1]!.key)).toMatchObject({ mine: true, told: true });
    expect(one(input, gro2, items[1]!.key)).toMatchObject({ mine: false, told: false });
  });

  it('leaves out finished work and work with no date', () => {
    const input = base({
      people: [person()],
      procedures: [
        proc({ status: 'completed' }),
        proc({ id: 'f0000000-0000-4000-8000-000000000002', dueOn: null }),
      ],
      tasks: [
        task({ status: 'done' }),
        task({ id: 'b0000000-0000-4000-8000-000000000002', dueOn: null }),
      ],
    });
    expect(buildLadder(input, admin).items).toEqual([]);
    // A rejected procedure is still open: it is retried.
    const rejected = base({ people: [person()], procedures: [proc({ status: 'rejected' })] });
    expect(buildLadder(rejected, admin).items).toHaveLength(1);
  });

  it('with nobody assigned there is no owner: first told at the stage that names a role', () => {
    const at = (days: number) =>
      base({ people: [person()], procedures: [proc({ assigneeUserId: null, dueOn: day(days) })] });
    const key = 'procedure:f0000000-0000-4000-8000-000000000001';
    // Notice (4 days): on the ladder, but it tells nobody.
    for (const who of [gro1, hr, admin]) {
      expect(one(at(4), who, key)).toMatchObject({ owner: null, mine: false, told: false });
    }
    expect(one(at(2), hr, key)?.told).toBe(true); // Reminder: HR officers
    expect(one(at(2), admin, key)?.told).toBe(false);
    expect(one(at(1), admin, key)?.told).toBe(true); // Escalated: + Administrators
  });

  it("a request's own task is not reported while the request still awaits a decision", () => {
    const REQ = 'aa000000-0000-4000-8000-000000000001';
    const request = (status: string) => ({
      id: REQ,
      clientId: CO,
      type: 'letter',
      title: 'Salary letter',
      status,
      dueOn: day(-2),
      assigneeUserId: null,
    });
    const tasks = [task({ requestId: REQ })];
    for (const status of ['open', 'info_needed']) {
      const k = keys(buildLadder(base({ tasks, requests: [request(status)] }), admin).items);
      expect(k, status).not.toContain('task:b0000000-0000-4000-8000-000000000001');
    }
    // Once approved, the task carries the deadline.
    const approved = keys(
      buildLadder(base({ tasks, requests: [request('in_progress')] }), admin).items,
    );
    expect(approved).toEqual(['task:b0000000-0000-4000-8000-000000000001']);
  });
});

describe('request service level', () => {
  const REQ = 'aa000000-0000-4000-8000-000000000001';
  const request = (over: object = {}) => ({
    id: REQ,
    clientId: CO,
    type: 'letter',
    title: 'Salary letter',
    status: 'open',
    dueOn: day(1),
    assigneeUserId: null,
    ...over,
  });

  it('measures a request awaiting a decision against its own due date', () => {
    const stage = (days: number) =>
      one(base({ requests: [request({ dueOn: day(days) })] }), admin, `request:${REQ}`)?.stage;
    expect([stage(5), stage(2), stage(1), stage(0), stage(-1)]).toEqual([
      undefined,
      'reminder',
      'escalation',
      'escalation',
      'breach',
    ]);
    expect(one(base({ requests: [request()] }), hr, `request:${REQ}`)).toMatchObject({
      rule: 'sla',
      subject: { kind: 'request', id: REQ, type: 'letter', title: 'Salary letter' },
      owner: null,
      told: true, // Reminder and above always name the HR officers
    });
  });

  it('leaves out a request that is decided, paused on its requester, or has no date', () => {
    for (const over of [
      { status: 'in_progress' },
      { status: 'info_needed' },
      { status: 'resolved' },
      { status: 'cancelled' },
      { dueOn: null },
    ]) {
      const k = keys(
        buildLadder(
          base({ requests: [request({ ...over, dueOn: 'dueOn' in over ? null : day(-5) })] }),
          admin,
        ).items,
      );
      expect(k, JSON.stringify(over)).toEqual([]);
    }
  });
});

describe('nobody is shown what they could not already open', () => {
  const input = base({
    people: [person({ dates: { iqama: day(-1), contract: day(-1) } })],
    dependants: [
      {
        id: 'd0000000-0000-4000-8000-000000000001',
        employeeId: P1,
        name: { ar: null, en: 'Y' },
        dates: { iqama: day(-1) },
      },
    ],
    procedures: [
      {
        id: 'f0000000-0000-4000-8000-000000000001',
        employeeId: P1,
        clientId: CO,
        type: 'exit_reentry',
        status: 'in_progress',
        dueOn: day(-1),
        assigneeUserId: null,
      },
    ],
    tasks: [
      {
        id: 'b0000000-0000-4000-8000-000000000001',
        title: 'T',
        clientId: CO,
        status: 'open',
        dueOn: day(-1),
        assigneeUserId: null,
        requestId: null,
      },
    ],
    requests: [
      {
        id: 'aa000000-0000-4000-8000-000000000001',
        clientId: CO,
        type: 'letter',
        title: 'R',
        status: 'open',
        dueOn: day(-1),
        assigneeUserId: null,
      },
    ],
  });
  const kinds = (perms: string[]) =>
    buildLadder(input, viewer(ADMIN, 'administrator', perms))
      .items.map((i) =>
        i.subject.kind === 'document' ? `document:${i.subject.doc}` : i.subject.kind,
      )
      .sort();

  it('each kind of item needs the permission that reads it — being an Administrator is not enough', () => {
    expect(kinds(STAFF)).toEqual([
      'dependant_document',
      'document:contract',
      'document:iqama',
      'procedure',
      'request',
      'task',
    ]);
    expect(kinds([])).toEqual([]);
    expect(kinds(['employee.read'])).toEqual(['dependant_document', 'document:contract']);
    expect(kinds(['govdata.read'])).toEqual([]); // a date without the record is nothing
    expect(kinds(['employee.read', 'govdata.read'])).toEqual([
      'dependant_document',
      'document:contract',
      'document:iqama',
    ]);
    expect(kinds(['gro.read'])).toEqual(['procedure']);
    expect(kinds(['task.read'])).toEqual(['task']);
    expect(kinds(['request.read'])).toEqual(['request']);
  });

  it('a quiet expiry the viewer could not have read is not counted as quiet for them', () => {
    const quiet = base({
      people: [person({ dates: { iqama: day(-1) } })],
      procedures: [
        {
          id: 'f0000000-0000-4000-8000-000000000001',
          employeeId: P1,
          clientId: CO,
          type: 'iqama_renewal',
          status: 'in_progress',
          dueOn: null,
          assigneeUserId: null,
        },
      ],
    });
    expect(buildLadder(quiet, admin).suppressed).toBe(1);
    expect(buildLadder(quiet, viewer(ADMIN, 'administrator', ['employee.read'])).suppressed).toBe(
      0,
    );
  });
});

describe('order', () => {
  it('most urgent first: the highest stage, then the fewest days left', () => {
    const input = base({
      people: [
        person({
          dates: { iqama: day(-1), work_permit: day(-20), passport: day(6), contract: day(25) },
        }),
      ],
      requests: [
        {
          id: 'aa000000-0000-4000-8000-000000000001',
          clientId: CO,
          type: 'letter',
          title: 'R',
          status: 'open',
          dueOn: day(2),
          assigneeUserId: null,
        },
      ],
    });
    expect(buildLadder(input, admin).items.map((i) => [i.stage, i.daysLeft])).toEqual([
      ['breach', -20],
      ['breach', -1],
      ['escalation', 6],
      ['reminder', 2],
      ['notice', 25],
    ]);
  });
});
