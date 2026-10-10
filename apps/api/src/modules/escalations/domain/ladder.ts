import {
  DEPENDANT_DOCS,
  DEPENDANT_DOC_OWNER,
  EMPLOYEE_DOCS,
  EMPLOYEE_DOC_OWNER,
  ESCALATION_STAGES,
  RENEWED_BY,
  STAGE_AUDIENCE,
  daysLeft,
  isFinished,
  isUnderManagement,
  stageFor,
  type DependantDoc,
  type EmployeeDoc,
  type EscalationItem,
  type EscalationOwner,
  type EscalationRule,
  type EscalationStage,
  type EscalationSubject,
  type EscalationThresholds,
  type OwnerRole,
} from '@hr/contracts';

// The escalation ladder, worked out for ONE viewer (ADR-021). Pure: it is
// handed the register as plain rows and returns what that viewer is shown.
// Nothing is stored and nothing is read here, so every rule below is tested
// without a database.
//
// Three things decide whether a viewer sees an item, and they are separate:
//   1. the RULE — the obligation has reached a stage (its highest only);
//   2. READ ACCESS — the viewer could already open the thing it is about.
//      A stage's audience never widens this;
//   3. the AUDIENCE — whether this stage tells the viewer (`told`), and
//      whether the item is theirs (`mine`). Items the viewer may read but is
//      not told about still appear under "Everything".

type Name = { ar: string; en: string };

export interface LadderViewer {
  userId: string;
  role: string;
  can(permission: string): boolean;
}
export interface LadderClient {
  id: string;
  name: Name;
  status: string;
  /** The named officer (ADR-019) — already checked to be an ACTIVE officer, else null. */
  officerUserId: string | null;
}
export interface LadderPerson {
  id: string;
  clientId: string;
  name: Name;
  nationality: string;
  employmentStatus: string;
  dates: Partial<Record<EmployeeDoc, string | null>>;
}
export interface LadderDependant {
  id: string;
  employeeId: string;
  name: { ar: string | null; en: string };
  dates: Partial<Record<DependantDoc, string | null>>;
}
export interface LadderProcedure {
  id: string;
  employeeId: string;
  clientId: string;
  type: string;
  status: string;
  dueOn: string | null;
  assigneeUserId: string | null;
}
export interface LadderTask {
  id: string;
  title: string;
  clientId: string | null;
  status: string;
  dueOn: string | null;
  assigneeUserId: string | null;
  /** The request that spawned it, if any. */
  requestId: string | null;
}
export interface LadderRequest {
  id: string;
  clientId: string;
  type: string;
  title: string;
  status: string;
  dueOn: string | null;
  assigneeUserId: string | null;
}
export interface LadderInput {
  /** The system timezone's date, YYYY-MM-DD. */
  today: string;
  thresholds: EscalationThresholds;
  clients: readonly LadderClient[];
  people: readonly LadderPerson[];
  dependants: readonly LadderDependant[];
  /** EVERY procedure — an open one keeps an expiry quiet whoever is looking. */
  procedures: readonly LadderProcedure[];
  /** Only the tasks the viewer may read (their task scope is applied by the caller). */
  tasks: readonly LadderTask[];
  /** EVERY request — an undecided one keeps its own task out of the queue rule. */
  requests: readonly LadderRequest[];
  /** Display names of the staff who own something. */
  names: ReadonlyMap<string, string | null>;
}

// The documents whose dates are government data: read only with `govdata.read`.
const GOVDATA_DOCS: ReadonlySet<EmployeeDoc> = new Set(['iqama', 'work_permit', 'passport']);
// A Saudi national has no iqama and no work permit (the People screen's rule).
const EXPAT_ONLY: ReadonlySet<EmployeeDoc> = new Set(['iqama', 'work_permit']);
// A request waiting on a decision — or on its requester — is spoken for by the
// service-level rule (or is paused): its spawned task stays out of the queue
// rule, so one obligation is not reported twice.
const UNDECIDED: ReadonlySet<string> = new Set(['open', 'info_needed']);

type Owner = { userId: string } | { role: OwnerRole } | null;

/** An item as the rules produce it. Whether the viewer has READ it is added by the service. */
export type LadderItem = Omit<EscalationItem, 'read'>;

export function buildLadder(
  input: LadderInput,
  viewer: LadderViewer,
): { items: LadderItem[]; suppressed: number } {
  const { today, thresholds } = input;
  const clients = new Map(input.clients.map((c) => [c.id, c]));
  const people = new Map(input.people.map((p) => [p.id, p]));
  const requests = new Map(input.requests.map((r) => [r.id, r]));
  const items: LadderItem[] = [];
  let suppressed = 0;

  const clientOf = (id: string | null): LadderItem['client'] => {
    const c = id ? clients.get(id) : undefined;
    return c ? { id: c.id, name: c.name } : null;
  };
  const isMine = (owner: Owner): boolean =>
    owner !== null &&
    ('userId' in owner ? owner.userId === viewer.userId : owner.role === viewer.role);
  const isTold = (rule: EscalationRule, stage: EscalationStage, mine: boolean): boolean => {
    const audience = STAGE_AUDIENCE[rule][stage] ?? [];
    return (
      (audience.includes('owner') && mine) ||
      (audience.includes('hr') && viewer.role === 'hr_officer') ||
      (audience.includes('admin') && viewer.role === 'administrator')
    );
  };
  const present = (owner: Owner): EscalationOwner | null =>
    owner === null
      ? null
      : 'userId' in owner
        ? { kind: 'person', name: input.names.get(owner.userId) ?? null }
        : { kind: 'role', role: owner.role };
  const push = (
    key: string,
    rule: EscalationRule,
    dueOn: string,
    subject: EscalationSubject,
    clientId: string | null,
    owner: Owner,
  ): void => {
    const days = daysLeft(today, dueOn);
    const stage = stageFor(rule, days, thresholds);
    if (!stage) return;
    const mine = isMine(owner);
    items.push({
      key,
      rule,
      stage,
      dueOn,
      daysLeft: days,
      subject,
      client: clientOf(clientId),
      owner: present(owner),
      mine,
      told: isTold(rule, stage, mine),
    });
  };

  // ---- document expiry: people under management, and their dependants ----
  // The named officer of the person's company owns it; failing one, the role
  // that looks after that kind of document.
  const expiryOwner = (clientId: string, fallback: OwnerRole): Owner => {
    const officer = clients.get(clientId)?.officerUserId;
    return officer ? { userId: officer } : { role: fallback };
  };
  const watched = (p: LadderPerson | undefined): p is LadderPerson =>
    p !== undefined && isUnderManagement(p.employmentStatus, clients.get(p.clientId)?.status ?? '');
  // An expiry is quiet while a procedure that renews it is open for the person.
  const beingRenewed = new Set<string>();
  for (const proc of input.procedures) {
    if (isFinished('procedure', proc.status)) continue;
    for (const doc of EMPLOYEE_DOCS) {
      if (RENEWED_BY[doc]?.includes(proc.type)) beingRenewed.add(`${proc.employeeId}:${doc}`);
    }
  }

  if (viewer.can('employee.read')) {
    for (const p of input.people) {
      if (!watched(p)) continue;
      const employee = { id: p.id, name: p.name };
      for (const doc of EMPLOYEE_DOCS) {
        const dueOn = p.dates[doc];
        if (!dueOn) continue;
        if (EXPAT_ONLY.has(doc) && p.nationality.toUpperCase() === 'SA') continue;
        if (GOVDATA_DOCS.has(doc) && !viewer.can('govdata.read')) continue;
        if (stageFor('expiry', daysLeft(today, dueOn), thresholds) === null) continue;
        if (beingRenewed.has(`${p.id}:${doc}`)) {
          suppressed += 1;
          continue;
        }
        push(
          `expiry:${p.id}:${doc}`,
          'expiry',
          dueOn,
          { kind: 'document', doc, employee },
          p.clientId,
          expiryOwner(p.clientId, EMPLOYEE_DOC_OWNER[doc]),
        );
      }
    }
    for (const d of input.dependants) {
      const sponsor = people.get(d.employeeId);
      if (!watched(sponsor)) continue;
      for (const doc of DEPENDANT_DOCS) {
        const dueOn = d.dates[doc];
        if (!dueOn) continue;
        push(
          `dependant:${d.id}:${doc}`,
          'expiry',
          dueOn,
          {
            kind: 'dependant_document',
            doc,
            dependant: { id: d.id, name: d.name },
            employee: { id: sponsor.id, name: sponsor.name },
          },
          sponsor.clientId,
          expiryOwner(sponsor.clientId, DEPENDANT_DOC_OWNER[doc]),
        );
      }
    }
  }

  // ---- queue deadlines: open procedures and open tasks that have a date ----
  // The assignee owns it; with nobody assigned there is no owner, and the item
  // is first shown at the stage that names a role.
  const assignee = (userId: string | null): Owner => (userId ? { userId } : null);
  if (viewer.can('gro.read')) {
    for (const proc of input.procedures) {
      if (!proc.dueOn || isFinished('procedure', proc.status)) continue;
      const person = people.get(proc.employeeId);
      if (!person) continue;
      push(
        `procedure:${proc.id}`,
        'queue',
        proc.dueOn,
        {
          kind: 'procedure',
          id: proc.id,
          type: proc.type,
          employee: { id: person.id, name: person.name },
        },
        proc.clientId,
        assignee(proc.assigneeUserId),
      );
    }
  }
  if (viewer.can('task.read')) {
    for (const task of input.tasks) {
      if (!task.dueOn || isFinished('task', task.status)) continue;
      const source = task.requestId ? requests.get(task.requestId) : undefined;
      if (source && UNDECIDED.has(source.status)) continue;
      push(
        `task:${task.id}`,
        'queue',
        task.dueOn,
        { kind: 'task', id: task.id, title: task.title },
        task.clientId,
        assignee(task.assigneeUserId),
      );
    }
  }

  // ---- request service level: requests waiting on a decision ----
  // Against the request's OWN due date, which already counts working days and
  // pauses while more detail is awaited (ADR-016). A request waiting on its
  // requester is not here: its clock is stopped.
  if (viewer.can('request.read')) {
    for (const r of input.requests) {
      if (r.status !== 'open' || !r.dueOn) continue;
      push(
        `request:${r.id}`,
        'sla',
        r.dueOn,
        { kind: 'request', id: r.id, type: r.type, title: r.title },
        r.clientId,
        assignee(r.assigneeUserId),
      );
    }
  }

  // Most urgent first: the highest stage, then the fewest days left.
  const rank = (s: EscalationStage) => ESCALATION_STAGES.indexOf(s);
  items.sort(
    (a, b) =>
      rank(b.stage) - rank(a.stage) || a.daysLeft - b.daysLeft || a.key.localeCompare(b.key),
  );
  return { items, suppressed };
}
