import { Injectable } from '@nestjs/common';
import {
  ACTION_STAGES,
  DEFAULT_ESCALATION_THRESHOLDS,
  ESCALATION_THRESHOLDS_KEY,
  escalationThresholdsSchema,
  type EscalationItem,
  type EscalationLadderResponse,
  type EscalationThresholds,
} from '@hr/contracts';
import { dayIn } from '@hr/dates';
import { requestContext } from '../../../context/request-context';
import { PrismaService } from '../../../prisma/prisma.service';
import { PolicyService, UsersService } from '../../auth/public-api';
import { ClientsService } from '../../clients/public-api';
import { ConfigService } from '../../configuration/public-api';
import { DependantsService, EmployeesService } from '../../employees/public-api';
import { GroProcessesService } from '../../gro/public-api';
import { RequestsService } from '../../requests/public-api';
import { TasksService } from '../../tasks/public-api';
import { buildLadder, type LadderViewer } from '../domain/ladder';

// The escalation ladder for the signed-in STAFF member (NC-01, ADR-021).
//
// The ladder is never stored. Each call reads the register through the owning
// modules' public APIs, hands it to the pure builder with who is asking, and
// returns what that person is shown. The rules live in `domain/ladder.ts` and in
// `@hr/contracts/escalation-rules`; this service only gathers.
//
// Two reads are deliberately NOT narrowed to the viewer:
//   · procedures — an open renewal keeps an expiry quiet whoever is looking;
//   · requests   — an undecided request keeps its own task out of the queue rule.
// The builder shows an item only to someone who may read it. Tasks ARE narrowed
// here, because a task's scope (own/assigned unless `task.read-all`) is a
// property of the reader that the builder cannot know.
//
// READ MARKS (NC-02) are the one thing kept: per person and item, the stage
// and the date at which they marked it read. An item is `read` only while it
// is still at that stage and date — climbing a stage, or a renewed date coming
// round again, makes it unread. A person can mark only what the ladder is
// showing THEM now: the keys they send are looked up in their own ladder and
// anything else is ignored, so a mark can never be a way to probe for records.

type UnmarkedItem = Omit<EscalationItem, 'read'>;
const iso = (d: Date | null | undefined): string | null =>
  d ? d.toISOString().slice(0, 10) : null;

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
    private readonly requests: RequestsService,
    private readonly tasks: TasksService,
  ) {}

  async forStaff(): Promise<EscalationLadderResponse> {
    const userId = requestContext.get()?.actorId ?? '';
    const [ladder, marks] = await Promise.all([this.derive(), this.marksOf(userId)]);
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
  async countForStaff(): Promise<number> {
    const { items } = await this.forStaff();
    return items.filter((i) => i.told && !i.read && ACTION_STAGES.includes(i.stage)).length;
  }

  // Marks the named items read — those the viewer is being shown, at the stage
  // and date they are at now. Then clears the viewer's marks for items that
  // have left their ladder: a mark for something renewed or finished says
  // nothing, and if the item comes round again it should be unread.
  async markReadForStaff(keys: readonly string[]): Promise<number> {
    const userId = requestContext.get()?.actorId ?? '';
    const { items } = await this.derive();
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

  // The ladder for the signed-in staff member, before read marks.
  private async derive(): Promise<
    Omit<EscalationLadderResponse, 'items'> & { items: UnmarkedItem[] }
  > {
    const ctx = requestContext.get();
    const userId = ctx?.actorId ?? '';
    const role = ctx?.role ?? '';
    const viewer: LadderViewer = { userId, role, can: (p) => this.policy.can(role, p) };

    const [clients, people, procedures, requests, tasks, thresholds, today] = await Promise.all([
      this.clients.list(),
      this.employees.list(),
      this.processes.list(),
      this.requests.list(),
      this.tasks.list({ scopeUserId: viewer.can('task.read-all') ? undefined : userId }),
      this.thresholds(),
      this.today(),
    ]);
    const dependants = await this.dependants.listForEmployees(people.map((p) => p.id));

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
      ...tasks.flatMap((t) => (t.assigneeUserId ? [t.assigneeUserId] : [])),
      ...requests.flatMap((r) => (r.assigneeUserId ? [r.assigneeUserId] : [])),
    ];
    const names = await this.users.displayNames([...new Set(owners)]);

    const { items, suppressed } = buildLadder(
      {
        today,
        thresholds,
        clients: clients.map((c) => ({
          id: c.id,
          name: { ar: c.nameAr, en: c.nameEn },
          status: c.status,
          officerUserId: c.officerUserId && active.has(c.officerUserId) ? c.officerUserId : null,
        })),
        people: people.map((p) => ({
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
          },
        })),
        dependants: dependants.map((d) => ({
          id: d.id,
          employeeId: d.employeeId,
          name: { ar: d.nameAr, en: d.nameEn },
          dates: {
            iqama: iso(d.iqamaExpiry),
            passport: iso(d.passportExpiry),
            insurance: iso(d.insuranceExpiry),
          },
        })),
        procedures: procedures.map((p) => ({
          id: p.id,
          employeeId: p.employeeId,
          clientId: p.clientId,
          type: p.type,
          status: p.status,
          dueOn: iso(p.dueDate),
          assigneeUserId: p.assigneeUserId,
        })),
        tasks: tasks.map((t) => ({
          id: t.id,
          title: t.title,
          clientId: t.clientId,
          status: t.status,
          dueOn: iso(t.dueDate),
          assigneeUserId: t.assigneeUserId,
          requestId: t.requestId,
        })),
        requests: requests.map((r) => ({
          id: r.id,
          clientId: r.clientId,
          type: r.type,
          title: r.title,
          status: r.status,
          dueOn: iso(r.dueDate),
          assigneeUserId: r.assigneeUserId,
        })),
        names,
      },
      viewer,
    );
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
