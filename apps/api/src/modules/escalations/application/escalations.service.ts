import { Injectable } from '@nestjs/common';
import {
  ACTION_STAGES,
  DEFAULT_ESCALATION_THRESHOLDS,
  ESCALATION_THRESHOLDS_KEY,
  escalationThresholdsSchema,
  type EscalationLadderResponse,
  type EscalationThresholds,
} from '@hr/contracts';
import { dayIn } from '@hr/dates';
import { requestContext } from '../../../context/request-context';
import type {
  ClientModel as ClientRecord,
  DependantModel as DependantRecord,
  EmployeeModel as EmployeeRecord,
  GroProcessModel as ProcedureRecord,
  RequestModel as RequestRecord,
} from '../../../generated/prisma/models';
import { PrismaService } from '../../../prisma/prisma.service';
import { PolicyService, UsersService } from '../../auth/public-api';
import { ClientsService } from '../../clients/public-api';
import { ConfigService } from '../../configuration/public-api';
import { DependantsService, EmployeesService } from '../../employees/public-api';
import { GroProcessesService, SequencesService, type SequenceView } from '../../gro/public-api';
import { RequestsService } from '../../requests/public-api';
import { TasksService } from '../../tasks/public-api';
import {
  buildClientLadder,
  buildEmployeeLadder,
  buildLadder,
  type LadderClient,
  type LadderDependant,
  type LadderItem,
  type LadderPerson,
  type LadderProcedure,
  type LadderStep,
  type LadderRequest,
  type LadderViewer,
} from '../domain/ladder';

// The escalation ladder for the person asking (ADR-021).
//
// The ladder is never stored. Each call reads the register through the owning
// modules' public APIs, hands it to a pure builder, and returns what that
// person is shown. The rules live in `domain/ladder.ts` and in
// `@hr/contracts/escalation-rules`; this service only GATHERS — and what it
// gathers depends on who is asking:
//
//   · STAFF (NC-01) — the whole register. Two reads are deliberately not
//     narrowed to the viewer: procedures (an open renewal keeps an expiry
//     quiet whoever is looking) and requests (an undecided request keeps its
//     own task out of the queue rule). The builder then shows an item only to
//     someone who may read it. Tasks ARE narrowed here, because a task's scope
//     is a property of the reader the builder cannot know.
//   · A CLIENT MANAGER (NC-05) — their own company only, read along the
//     client's own paths (the RLS-fenced request and procedure lists; people
//     only while their portal is switched on, as the portal itself requires).
//   · An EMPLOYEE (NC-05) — their own record (already fetched and gated by the
//     `/me` controller), their own dependants and the requests they raised,
//     all through the employee's fenced reads. One read is NOT fenced: this
//     person's open procedures, on the staff connection, used for one thing —
//     keeping quiet a document that is already being renewed. No procedure is
//     ever returned to them.
//
// READ MARKS (NC-02) are the one thing kept: per person and item, the stage
// and the date at which they marked it read. An item is `read` only while it
// is still at that stage and date — climbing a stage, or a renewed date coming
// round again, makes it unread. A person can mark only what the ladder is
// showing THEM now: the keys they send are looked up in their own ladder and
// anything else is ignored, so a mark can never be a way to probe for records.
// Marks are written on the staff connection for every kind of viewer: the row
// holds a user id and an item key, and the service has already worked out
// what that user is shown.

const CLIENT_SELF_SERVICE_FLAG = 'flag.client-self-service';

/** Who is asking. The controller decides this from the session, never from input. */
export type LadderView =
  | { kind: 'staff' }
  | { kind: 'client'; clientId: string }
  | { kind: 'employee'; record: EmployeeRecord };

type Derived = Omit<EscalationLadderResponse, 'items'> & { items: LadderItem[] };

const iso = (d: Date | null | undefined): string | null =>
  d ? d.toISOString().slice(0, 10) : null;

const toClient = (c: ClientRecord, officerUserId: string | null): LadderClient => ({
  id: c.id,
  name: { ar: c.nameAr, en: c.nameEn },
  status: c.status,
  officerUserId,
});
const toPerson = (p: EmployeeRecord): LadderPerson => ({
  id: p.id,
  clientId: p.clientId,
  name: { ar: p.nameAr, en: p.nameEn },
  nationality: p.nationality,
  employmentStatus: p.employmentStatus,
  dates: {
    iqama: iso(p.iqamaExpiry),
    work_permit: iso(p.workPermitExpiry),
    passport: iso(p.passportExpiry),
    contract: iso(p.contractEndDate),
    medical_insurance: iso(p.medicalInsuranceExpiry),
    driving_licence: iso(p.drivingLicenceExpiry),
  },
});
const toDependant = (d: DependantRecord): LadderDependant => ({
  id: d.id,
  employeeId: d.employeeId,
  name: { ar: d.nameAr, en: d.nameEn },
  dates: {
    iqama: iso(d.iqamaExpiry),
    passport: iso(d.passportExpiry),
    insurance: iso(d.insuranceExpiry),
  },
});
const toProcedure = (p: ProcedureRecord): LadderProcedure => ({
  id: p.id,
  employeeId: p.employeeId,
  clientId: p.clientId,
  type: p.type,
  status: p.status,
  dueOn: iso(p.dueDate),
  assigneeUserId: p.assigneeUserId,
  dependantId: p.dependantId,
});
// Every step of a run, with its state — the rules keep only READY ones of a
// RUNNING run (MOB-06a).
const toSteps = (run: SequenceView): LadderStep[] =>
  run.steps.map((st) => ({
    sequenceId: run.id,
    sequenceKind: run.kind,
    key: st.key,
    employeeId: run.employeeId,
    clientId: run.clientId,
    dueOn: st.target,
    assigneeUserId: run.assigneeUserId,
    state: st.state,
    runStatus: run.status,
  }));
const toRequest = (r: RequestRecord): LadderRequest => ({
  id: r.id,
  clientId: r.clientId,
  type: r.type,
  title: r.title,
  status: r.status,
  dueOn: iso(r.dueDate),
  assigneeUserId: r.assigneeUserId,
});

@Injectable()
export class EscalationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly users: UsersService,
    private readonly clients: ClientsService,
    private readonly config: ConfigService,
    private readonly employees: EmployeesService,
    private readonly dependants: DependantsService,
    private readonly processes: GroProcessesService,
    private readonly sequences: SequencesService,
    private readonly requests: RequestsService,
    private readonly tasks: TasksService,
  ) {}

  async ladder(view: LadderView): Promise<EscalationLadderResponse> {
    const userId = requestContext.get()?.actorId ?? '';
    const [ladder, marks] = await Promise.all([this.derive(view), this.marksOf(userId)]);
    return {
      ...ladder,
      items: ladder.items.map((i) => {
        const mark = marks.get(i.key);
        return {
          ...i,
          read: mark !== undefined && mark.stage === i.stage && mark.dueOn === i.dueOn,
        };
      }),
    };
  }

  // The bell's number: what the viewer is told about, at Escalated or Breach,
  // and has not read at that stage and date.
  async count(view: LadderView): Promise<number> {
    const { items } = await this.ladder(view);
    return items.filter((i) => i.told && !i.read && ACTION_STAGES.includes(i.stage)).length;
  }

  // Marks the named items read — those the viewer is being shown, at the stage
  // and date they are at now. Then clears the viewer's marks for items that
  // have left their ladder: a mark for something renewed or finished says
  // nothing, and if the item comes round again it should be unread.
  async markRead(view: LadderView, keys: readonly string[]): Promise<number> {
    const userId = requestContext.get()?.actorId ?? '';
    const { items } = await this.derive(view);
    const shown = new Map(items.map((i) => [i.key, i]));
    const wanted = [...new Set(keys)].flatMap((k) => {
      const item = shown.get(k);
      return item ? [item] : [];
    });
    await this.prisma.$transaction(async (tx) => {
      for (const item of wanted) {
        const mark = {
          stage: item.stage,
          dueOn: new Date(`${item.dueOn}T00:00:00.000Z`),
          readAt: new Date(),
        };
        await tx.escalationRead.upsert({
          where: { userId_itemKey: { userId, itemKey: item.key } },
          create: { userId, itemKey: item.key, ...mark },
          update: mark,
        });
      }
      await tx.escalationRead.deleteMany({
        where: { userId, itemKey: { notIn: [...shown.keys()] } },
      });
    });
    return wanted.length;
  }

  private async marksOf(userId: string): Promise<Map<string, { stage: string; dueOn: string }>> {
    const rows = await this.prisma.escalationRead.findMany({ where: { userId } });
    return new Map(
      rows.map((r) => [r.itemKey, { stage: r.stage, dueOn: r.dueOn.toISOString().slice(0, 10) }]),
    );
  }

  // The ladder before read marks.
  private derive(view: LadderView): Promise<Derived> {
    if (view.kind === 'client') return this.deriveForClient(view.clientId);
    if (view.kind === 'employee') return this.deriveForEmployee(view.record);
    return this.deriveForStaff();
  }

  private async deriveForStaff(): Promise<Derived> {
    const ctx = requestContext.get();
    const userId = ctx?.actorId ?? '';
    const role = ctx?.role ?? '';
    const viewer: LadderViewer = { userId, role, can: (p) => this.policy.can(role, p) };

    const [clients, people, procedures, runs, requests, tasks, thresholds, today] =
      await Promise.all([
        this.clients.list(),
        this.employees.list(),
        this.processes.list(),
        // MOB-06a: running onboardings / final exits — their ready steps are work.
        this.sequences.listByStatus('running'),
        this.requests.list(),
        this.tasks.list({ scopeUserId: viewer.can('task.read-all') ? undefined : userId }),
        this.thresholds(),
        this.today(),
      ]);
    const dependants = await this.dependants.listForEmployees(people.map((p) => p.id));
    // DEP-07: the names of the dependants that procedures are for — removed ones
    // included, since a procedure outlives a removal only until it is cancelled.
    const procedureDependants = await this.dependants.namesOf(
      procedures.flatMap((p) => (p.dependantId ? [p.dependantId] : [])),
    );

    // A named officer owns their client's expiries only while they are still an
    // active officer; otherwise ownership falls back to the role (ADR-021).
    const named = [...new Set(clients.flatMap((c) => (c.officerUserId ? [c.officerUserId] : [])))];
    const active = new Set(
      (
        await Promise.all(
          named.map(async (id) =>
            (await this.users.isActiveStaffWith(id, 'gro.process')) ? id : null,
          ),
        )
      ).filter((id): id is string => id !== null),
    );
    const owners = [
      ...active,
      ...procedures.flatMap((p) => (p.assigneeUserId ? [p.assigneeUserId] : [])),
      ...runs.flatMap((r) => (r.assigneeUserId ? [r.assigneeUserId] : [])),
      ...tasks.flatMap((t) => (t.assigneeUserId ? [t.assigneeUserId] : [])),
      ...requests.flatMap((r) => (r.assigneeUserId ? [r.assigneeUserId] : [])),
    ];
    const names = await this.users.displayNames([...new Set(owners)]);

    const { items, suppressed } = buildLadder(
      {
        today,
        thresholds,
        clients: clients.map((c) =>
          toClient(c, c.officerUserId && active.has(c.officerUserId) ? c.officerUserId : null),
        ),
        people: people.map(toPerson),
        dependants: dependants.map(toDependant),
        procedures: procedures.map((p) => {
          const named = p.dependantId ? procedureDependants.get(p.dependantId) : undefined;
          return {
            ...toProcedure(p),
            dependantName: named ? { ar: named.nameAr, en: named.nameEn } : null,
          };
        }),
        steps: runs.flatMap(toSteps),
        tasks: tasks.map((t) => ({
          id: t.id,
          title: t.title,
          clientId: t.clientId,
          status: t.status,
          dueOn: iso(t.dueDate),
          assigneeUserId: t.assigneeUserId,
          requestId: t.requestId,
        })),
        requests: requests.map(toRequest),
        names,
      },
      viewer,
    );
    return { today, thresholds, items, suppressed };
  }

  // A client manager: their own company, along the client's own paths. People
  // (and the procedures that keep an expiry quiet) only while the portal is
  // switched on — the ladder never shows a client more than their portal does.
  // Their requests do not depend on the portal: they see those regardless.
  private async deriveForClient(clientId: string): Promise<Derived> {
    const [client, portalOn, requests, thresholds, today] = await Promise.all([
      this.clients.getById(clientId),
      this.config.isEnabled(CLIENT_SELF_SERVICE_FLAG, { clientId }),
      this.requests.listForClient(clientId),
      this.thresholds(),
      this.today(),
    ]);
    const [people, procedures] = portalOn
      ? await Promise.all([
          this.employees.listByClient(clientId),
          this.processes.listForClient(clientId),
        ])
      : [[], []];
    const { items, suppressed } = buildClientLadder({
      today,
      thresholds,
      clients: client ? [toClient(client, null)] : [],
      people: people.map(toPerson),
      dependants: [],
      procedures: procedures.map(toProcedure),
      steps: [], // staff work — never a client's or an employee's item
      tasks: [],
      requests: requests.map(toRequest),
      names: new Map(),
    });
    return { today, thresholds, items, suppressed };
  }

  // An employee: the record the `/me` gate has already fetched and checked.
  private async deriveForEmployee(record: EmployeeRecord): Promise<Derived> {
    const [client, dependants, requests, procedures, thresholds, today] = await Promise.all([
      this.clients.getById(record.clientId),
      this.dependants.listForSelf(record.id),
      this.requests.listForEmployee(record.id),
      // Staff connection, this one person: only to keep quiet what is being renewed.
      this.processes.list({ employeeId: record.id }),
      this.thresholds(),
      this.today(),
    ]);
    const { items, suppressed } = buildEmployeeLadder({
      today,
      thresholds,
      clients: client ? [toClient(client, null)] : [],
      people: [toPerson(record)],
      dependants: dependants.map(toDependant),
      procedures: procedures.map(toProcedure),
      steps: [], // staff work — never a client's or an employee's item
      tasks: [],
      requests: requests.map(toRequest),
      names: new Map(),
    });
    return { today, thresholds, items, suppressed };
  }

  // The thresholds in force. A stored value that no longer fits the schema
  // (it cannot be written through the API) falls back to the defaults rather
  // than taking the ladder down.
  private async thresholds(): Promise<EscalationThresholds> {
    const parsed = escalationThresholdsSchema.safeParse(
      await this.config.get(ESCALATION_THRESHOLDS_KEY),
    );
    return parsed.success ? parsed.data : DEFAULT_ESCALATION_THRESHOLDS;
  }

  /** Today's date where the business is: the system timezone, as YYYY-MM-DD. */
  private async today(): Promise<string> {
    const tz = await this.config.get('timezone');
    return dayIn(new Date(), typeof tz === 'string' ? tz : 'Asia/Riyadh')
      .toISOString()
      .slice(0, 10);
  }
}
