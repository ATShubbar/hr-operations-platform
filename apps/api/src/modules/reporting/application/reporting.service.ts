import { Injectable } from '@nestjs/common';
import { ClientsService } from '../../clients/public-api';
import { EmployeesService } from '../../employees/public-api';
import { DocumentsService } from '../../documents/public-api';
import { VacanciesService, CandidatesService } from '../../recruitment/public-api';
import { GroProcessesService } from '../../gro/public-api';
import { RequestsService } from '../../requests/public-api';
import { TasksService } from '../../tasks/public-api';
import type { ReportId } from '../domain/report-catalog';
import { count, text, type ReportResult, type ReportRow } from '../domain/report-result';
import { bump, expiryBucket, isPastDue, money, round2 } from '../domain/report-metrics';

// Reporting read models (REP-01; ACTION-PLAN 5.4, architecture module 11).
//
// A DELIVERY-LAYER service: it holds no business rules and owns no tables. Every
// figure is composed from the OWNING module's service (module rule 3 — no module
// touches another's tables), exactly as Calendar composes Tasks/Requests/GRO.
// Nothing imports Reporting, so this sits at the top of the graph with no cycle.
//
// v1 is transactional queries against the primary, per the architecture. A
// materialized view spanning several modules' tables would put a shared DB object
// astride their schemas and break "own your data"; if a report is ever provably
// slow, the MV belongs to the module whose data it aggregates — not here.
//
// This service is deliberately PERMISSION-AGNOSTIC: it computes. Which reports a
// caller may run is declared in domain/report-catalog.ts and enforced at the HTTP
// edge (REP-02) — notably `payroll-cost`, whose salary figures are only reachable
// through a salary.read-gated route.
@Injectable()
export class ReportingService {
  constructor(
    private readonly clients: ClientsService,
    private readonly employees: EmployeesService,
    private readonly documents: DocumentsService,
    private readonly vacancies: VacanciesService,
    private readonly candidates: CandidatesService,
    private readonly gro: GroProcessesService,
    private readonly requests: RequestsService,
    private readonly tasks: TasksService,
  ) {}

  // `now` is injectable so bucket/overdue arithmetic is deterministic in tests.
  run(id: ReportId, now: Date = new Date()): Promise<ReportResult> {
    switch (id) {
      case 'workforce':
        return this.workforce(now);
      case 'compliance-expiry':
        return this.complianceExpiry(now);
      case 'recruitment-pipeline':
        return this.recruitmentPipeline(now);
      case 'gro-workload':
        return this.groWorkload(now);
      case 'service-operations':
        return this.serviceOperations(now);
      case 'payroll-cost':
        return this.payrollCost(now);
    }
  }

  // Headcount and composition by client. Clients with no employees are still
  // listed — an empty client is information, not an absence of data.
  private async workforce(now: Date): Promise<ReportResult> {
    const [clients, employees] = await Promise.all([this.clients.list(), this.employees.list()]);
    const byClient = new Map<string, ReportRow>();
    for (const c of clients) {
      byClient.set(c.id, {
        client: c.nameEn,
        headcount: 0,
        active: 0,
        onLeave: 0,
        suspended: 0,
        terminated: 0,
        saudi: 0,
        nonSaudi: 0,
        saudizationPct: 0,
      });
    }

    const STATUS_KEY: Record<string, string> = {
      active: 'active',
      on_leave: 'onLeave',
      suspended: 'suspended',
      terminated: 'terminated',
    };
    for (const e of employees) {
      const row = byClient.get(e.clientId);
      if (!row) continue; // an employee whose client was hard-deleted — not counted
      row.headcount = (row.headcount as number) + 1;
      const key = STATUS_KEY[e.employmentStatus];
      if (key) row[key] = (row[key] as number) + 1;
      // Saudization proxy: nationality 'SA'. `countsTowardSaudization` is a
      // nullable v1 field (manual entry), so nationality is the reliable signal.
      if (e.nationality === 'SA') row.saudi = (row.saudi as number) + 1;
      else row.nonSaudi = (row.nonSaudi as number) + 1;
    }

    const rows = [...byClient.values()];
    for (const row of rows) {
      const headcount = row.headcount as number;
      row.saudizationPct = headcount === 0 ? 0 : round2(((row.saudi as number) / headcount) * 100);
    }
    rows.sort(byNumberThenLabel('headcount', 'client'));

    const headcount = employees.length;
    const saudi = employees.filter((e) => e.nationality === 'SA').length;
    return {
      id: 'workforce',
      generatedAt: now.toISOString(),
      columns: [
        text('client', 'Client'),
        count('headcount', 'Headcount'),
        count('active', 'Active'),
        count('onLeave', 'On leave'),
        count('suspended', 'Suspended'),
        count('terminated', 'Terminated'),
        count('saudi', 'Saudi'),
        count('nonSaudi', 'Non-Saudi'),
        count('saudizationPct', 'Saudization %'),
      ],
      rows,
      summary: {
        clients: clients.length,
        headcount,
        active: employees.filter((e) => e.employmentStatus === 'active').length,
        saudi,
        saudizationPct: headcount === 0 ? 0 : round2((saudi / headcount) * 100),
      },
    };
  }

  // What expires when, across employee government data and documents, in the
  // 90-day horizon. One row per expiring ITEM KIND — the compliance question is
  // "what is about to lapse", and per-document detail is the EXP-03 dashboard.
  private async complianceExpiry(now: Date): Promise<ReportResult> {
    const [employees, documents] = await Promise.all([
      this.employees.list(),
      this.documents.find({}), // excludes soft-deleted documents
    ]);

    const kinds: { key: string; label: string; dates: (Date | null)[] }[] = [
      { key: 'iqama', label: 'Iqama', dates: employees.map((e) => e.iqamaExpiry) },
      { key: 'passport', label: 'Passport', dates: employees.map((e) => e.passportExpiry) },
      { key: 'workPermit', label: 'Work permit', dates: employees.map((e) => e.workPermitExpiry) },
      {
        key: 'exitReentry',
        label: 'Exit/re-entry',
        dates: employees.map((e) => e.exitReentryExpiry),
      },
      { key: 'document', label: 'Documents', dates: documents.map((d) => d.expiryDate) },
    ];

    const rows: ReportRow[] = [];
    const summary = { expired: 0, due30: 0, due60: 0, due90: 0, total: 0 };
    for (const kind of kinds) {
      const row: ReportRow = { item: kind.label, expired: 0, due30: 0, due60: 0, due90: 0, total: 0 };
      for (const date of kind.dates) {
        const bucket = expiryBucket(date, now);
        if (!bucket) continue;
        row[bucket] = (row[bucket] as number) + 1;
        row.total = (row.total as number) + 1;
        summary[bucket] += 1;
        summary.total += 1;
      }
      rows.push(row);
    }

    return {
      id: 'compliance-expiry',
      generatedAt: now.toISOString(),
      columns: [
        text('item', 'Item'),
        count('expired', 'Expired'),
        count('due30', 'Due ≤30d'),
        count('due60', 'Due ≤60d'),
        count('due90', 'Due ≤90d'),
        count('total', 'Total'),
      ],
      rows,
      summary,
    };
  }

  // The recruitment funnel: one row per vacancy with its candidate stage counts.
  private async recruitmentPipeline(now: Date): Promise<ReportResult> {
    const [clients, vacancies, candidates] = await Promise.all([
      this.clients.list(),
      this.vacancies.list(),
      this.candidates.list(),
    ]);
    const clientName = new Map(clients.map((c) => [c.id, c.nameEn]));

    const stages = new Map<string, Record<string, number>>();
    for (const c of candidates) {
      const tally = stages.get(c.vacancyId) ?? {};
      bump(tally, c.stage);
      stages.set(c.vacancyId, tally);
    }

    const rows = vacancies.map((v) => {
      const tally = stages.get(v.id) ?? {};
      const closed = (tally.rejected ?? 0) + (tally.withdrawn ?? 0);
      const total = Object.values(tally).reduce((a, b) => a + b, 0);
      return {
        client: clientName.get(v.clientId) ?? '—',
        vacancy: v.titleEn,
        status: v.status,
        headcount: v.headcount,
        applied: tally.applied ?? 0,
        screening: tally.screening ?? 0,
        interview: tally.interview ?? 0,
        offer: tally.offer ?? 0,
        hired: tally.hired ?? 0,
        closed,
        candidates: total,
      } satisfies ReportRow;
    });
    rows.sort(byNumberThenLabel('candidates', 'vacancy'));

    const inPipeline = candidates.filter((c) =>
      ['applied', 'screening', 'interview', 'offer'].includes(c.stage),
    ).length;
    return {
      id: 'recruitment-pipeline',
      generatedAt: now.toISOString(),
      columns: [
        text('client', 'Client'),
        text('vacancy', 'Vacancy'),
        text('status', 'Status'),
        count('headcount', 'Headcount'),
        count('applied', 'Applied'),
        count('screening', 'Screening'),
        count('interview', 'Interview'),
        count('offer', 'Offer'),
        count('hired', 'Hired'),
        count('closed', 'Rejected/withdrawn'),
        count('candidates', 'Candidates'),
      ],
      rows,
      summary: {
        vacancies: vacancies.length,
        openVacancies: vacancies.filter((v) => v.status === 'open').length,
        candidates: candidates.length,
        inPipeline,
        hired: candidates.filter((c) => c.stage === 'hired').length,
      },
    };
  }

  // Government-process workload by procedure type, with overdue counts. Only
  // types that actually have processes appear — eight zero rows are noise.
  private async groWorkload(now: Date): Promise<ReportResult> {
    const processes = await this.gro.list();
    const byType = new Map<string, ReportRow>();
    let overdue = 0;

    for (const p of processes) {
      const row =
        byType.get(p.type) ??
        ({
          type: p.type,
          notStarted: 0,
          inProgress: 0,
          submitted: 0,
          approved: 0,
          rejected: 0,
          completed: 0,
          cancelled: 0,
          overdue: 0,
          total: 0,
        } satisfies ReportRow);
      const key = STATUS_COLUMN[p.status];
      if (key) row[key] = (row[key] as number) + 1;
      row.total = (row.total as number) + 1;
      // Overdue = a past due date on a process that still has a live deadline.
      // Terminal set matches CAL-02's (completed/rejected/cancelled).
      if (isActiveProcess(p.status) && isPastDue(p.dueDate, now)) {
        row.overdue = (row.overdue as number) + 1;
        overdue += 1;
      }
      byType.set(p.type, row);
    }

    const rows = [...byType.values()].sort(byNumberThenLabel('total', 'type'));
    return {
      id: 'gro-workload',
      generatedAt: now.toISOString(),
      columns: [
        text('type', 'Process type'),
        count('notStarted', 'Not started'),
        count('inProgress', 'In progress'),
        count('submitted', 'Submitted'),
        count('approved', 'Approved'),
        count('rejected', 'Rejected'),
        count('completed', 'Completed'),
        count('cancelled', 'Cancelled'),
        count('overdue', 'Overdue'),
        count('total', 'Total'),
      ],
      rows,
      summary: {
        total: processes.length,
        active: processes.filter((p) => isActiveProcess(p.status)).length,
        overdue,
        completed: processes.filter((p) => p.status === 'completed').length,
      },
    };
  }

  // Service load per client: client-facing requests beside internal tasks.
  // Tasks carry an OPTIONAL clientId (a standalone internal task has none), so
  // those land in a dedicated "(no client)" row rather than being dropped.
  private async serviceOperations(now: Date): Promise<ReportResult> {
    const [clients, requests, tasks] = await Promise.all([
      this.clients.list(),
      this.requests.list(),
      this.tasks.list(),
    ]);

    const blank = (label: string): ReportRow => ({
      client: label,
      reqOpen: 0,
      reqInProgress: 0,
      reqDone: 0,
      reqOverdue: 0,
      taskOpen: 0,
      taskInProgress: 0,
      taskDone: 0,
      taskOverdue: 0,
      taskUnassigned: 0,
    });
    const byClient = new Map<string, ReportRow>();
    for (const c of clients) byClient.set(c.id, blank(c.nameEn));
    const NO_CLIENT = 'no-client';

    let reqOverdue = 0;
    for (const r of requests) {
      const row = byClient.get(r.clientId);
      if (!row) continue;
      if (r.status === 'open') row.reqOpen = (row.reqOpen as number) + 1;
      else if (r.status === 'in_progress') row.reqInProgress = (row.reqInProgress as number) + 1;
      else row.reqDone = (row.reqDone as number) + 1; // resolved / closed / cancelled
      if (isActiveRequest(r.status) && isPastDue(r.dueDate, now)) {
        row.reqOverdue = (row.reqOverdue as number) + 1;
        reqOverdue += 1;
      }
    }

    let taskOverdue = 0;
    let taskUnassigned = 0;
    for (const t of tasks) {
      const key = t.clientId && byClient.has(t.clientId) ? t.clientId : NO_CLIENT;
      const row = byClient.get(key) ?? blank('(no client)');
      byClient.set(key, row);
      if (t.status === 'open') row.taskOpen = (row.taskOpen as number) + 1;
      else if (t.status === 'in_progress') row.taskInProgress = (row.taskInProgress as number) + 1;
      else row.taskDone = (row.taskDone as number) + 1; // done / cancelled
      if (isActiveTask(t.status)) {
        if (isPastDue(t.dueDate, now)) {
          row.taskOverdue = (row.taskOverdue as number) + 1;
          taskOverdue += 1;
        }
        if (!t.assigneeUserId) {
          row.taskUnassigned = (row.taskUnassigned as number) + 1;
          taskUnassigned += 1;
        }
      }
    }

    const rows = [...byClient.values()].sort(byNumberThenLabel('reqOpen', 'client'));
    return {
      id: 'service-operations',
      generatedAt: now.toISOString(),
      columns: [
        text('client', 'Client'),
        count('reqOpen', 'Requests open'),
        count('reqInProgress', 'Requests in progress'),
        count('reqDone', 'Requests closed'),
        count('reqOverdue', 'Requests overdue'),
        count('taskOpen', 'Tasks open'),
        count('taskInProgress', 'Tasks in progress'),
        count('taskDone', 'Tasks done'),
        count('taskOverdue', 'Tasks overdue'),
        count('taskUnassigned', 'Tasks unassigned'),
      ],
      rows,
      summary: {
        requests: requests.length,
        requestsOverdue: reqOverdue,
        tasks: tasks.length,
        tasksOverdue: taskOverdue,
        tasksUnassigned: taskUnassigned,
      },
    };
  }

  // Payroll cost by client — the financial report. Only ACTIVE employees are
  // costed (a terminated employee is not a monthly cost), and only those with a
  // basic salary recorded, since v1 salary entry is manual and partial.
  private async payrollCost(now: Date): Promise<ReportResult> {
    const [clients, employees] = await Promise.all([this.clients.list(), this.employees.list()]);
    const costed = employees.filter((e) => e.employmentStatus === 'active' && e.basicSalary != null);

    const byClient = new Map<string, ReportRow>();
    for (const c of clients) {
      byClient.set(c.id, {
        client: c.nameEn,
        employees: 0,
        currency: 'SAR',
        basicTotal: 0,
        allowancesTotal: 0,
        monthlyTotal: 0,
        avgMonthly: 0,
      });
    }

    let monthlyTotal = 0;
    for (const e of costed) {
      const row = byClient.get(e.clientId);
      if (!row) continue;
      const basic = money(e.basicSalary);
      const allowances =
        money(e.housingAllowance) + money(e.transportAllowance) + money(e.otherAllowances);
      row.employees = (row.employees as number) + 1;
      row.currency = e.currency; // v1 is single-currency per client in practice
      row.basicTotal = round2((row.basicTotal as number) + basic);
      row.allowancesTotal = round2((row.allowancesTotal as number) + allowances);
      row.monthlyTotal = round2((row.monthlyTotal as number) + basic + allowances);
      monthlyTotal = round2(monthlyTotal + basic + allowances);
    }
    for (const row of byClient.values()) {
      const n = row.employees as number;
      row.avgMonthly = n === 0 ? 0 : round2((row.monthlyTotal as number) / n);
    }

    const rows = [...byClient.values()].sort(byNumberThenLabel('monthlyTotal', 'client'));
    return {
      id: 'payroll-cost',
      generatedAt: now.toISOString(),
      columns: [
        text('client', 'Client'),
        count('employees', 'Employees costed'),
        text('currency', 'Currency'),
        count('basicTotal', 'Basic total'),
        count('allowancesTotal', 'Allowances total'),
        count('monthlyTotal', 'Monthly total'),
        count('avgMonthly', 'Average monthly'),
      ],
      rows,
      summary: {
        employees: costed.length,
        monthlyTotal,
        annualTotal: round2(monthlyTotal * 12),
      },
    };
  }
}

// GRO status → its column key.
const STATUS_COLUMN: Record<string, string> = {
  not_started: 'notStarted',
  in_progress: 'inProgress',
  submitted: 'submitted',
  approved: 'approved',
  rejected: 'rejected',
  completed: 'completed',
  cancelled: 'cancelled',
};

// Terminal-status sets, matching CAL-02's calendar-view definition: an item in a
// terminal state no longer has a live deadline, so it can never be "overdue".
function isActiveProcess(status: string): boolean {
  return !['completed', 'rejected', 'cancelled'].includes(status);
}
function isActiveRequest(status: string): boolean {
  return !['closed', 'cancelled'].includes(status);
}
function isActiveTask(status: string): boolean {
  return !['done', 'cancelled'].includes(status);
}

// Rows sort by a headline metric (descending) with a label tie-break, so a report
// is stable across runs — an export that reshuffles row order is unreadable.
function byNumberThenLabel(metric: string, label: string) {
  return (a: ReportRow, b: ReportRow): number =>
    (b[metric] as number) - (a[metric] as number) ||
    String(a[label]).localeCompare(String(b[label]));
}
