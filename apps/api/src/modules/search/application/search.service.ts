import { Injectable } from '@nestjs/common';
import type { LeaveStatus, LeaveType, SearchHit, SearchResponse } from '@hr/contracts';
import { matchesAnyField, normalizeForSearch } from '@hr/text';
import { PrismaService } from '../../../prisma/prisma.service';
import { requestContext } from '../../../context/request-context';
import { scopeOf } from '../../../auth/scope';
import { AuditService } from '../../audit/public-api';
import { PolicyService } from '../../auth/public-api';
import { ClientsService } from '../../clients/public-api';
import { ConfigService } from '../../configuration/public-api';
import { EmployeesService } from '../../employees/public-api';
import { GroProcessesService } from '../../gro/public-api';
import { LeaveService } from '../../leave/public-api';
import { RequestsService } from '../../requests/public-api';
import { TasksService } from '../../tasks/public-api';

export const MAX_HITS = 12;

// The identifier fields a person can be found by — only for holders of
// govdata.read (ADR-015 §2: a role that cannot see a number cannot find by it).
const IDENTIFIERS = [
  ['iqamaNumber', 'iqama'],
  ['nationalId', 'national_id'],
  ['borderNumber', 'border'],
  ['passportNumber', 'passport'],
  ['gosiRegistrationNumber', 'gosi'],
  ['workPermitNumber', 'work_permit'],
] as const;

type IdKind = (typeof IDENTIFIERS)[number][1];
type MatchedOn = Extract<SearchHit, { kind: 'person' }>['matchedOn'];
type Names = { nameEn: string; nameAr: string };

// An identifier query: at least 4 characters, at least one digit, compared with
// spaces and dashes removed (people type "2 123 456 789" and "2123456789").
const idKey = (s: string): string => normalizeForSearch(s).replace(/[\s-]/g, '');
const looksLikeIdentifier = (q: string): boolean => idKey(q).length >= 4 && /\d/.test(idKey(q));

// Global search (ADR-015, SEARCH-01) — a DELIVERY module: owns no data, reads the
// other modules through their public APIs, nothing imports it. Every kind of
// result goes through the caller's own access to it (the same permission, and
// for requests/leave the same RLS path, as the screen that shows it), so the box
// can never find something the caller couldn't open. A match on a government
// identifier is audited (who, which kind, last four digits, how many matched).
@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly policy: PolicyService,
    private readonly clients: ClientsService,
    private readonly config: ConfigService,
    private readonly employees: EmployeesService,
    private readonly gro: GroProcessesService,
    private readonly tasks: TasksService,
    private readonly requests: RequestsService,
    private readonly leave: LeaveService,
  ) {}

  async search(q: string): Promise<SearchResponse> {
    const ctx = requestContext.get();
    const can = (p: string) => this.policy.can(ctx?.role, p);
    const hits: SearchHit[] = [];

    // ---- employee: their own requests and leave only -------------------------
    if (ctx?.principalType === 'employee' && ctx.employeeId) {
      const own = await this.employees.getSelf(ctx.employeeId);
      // The same switch as every /me screen: self-service off for their company
      // (or no record) → nothing to find (ADR-011).
      if (
        !own ||
        !(await this.config.isEnabled('flag.employee-self-service', { clientId: own.clientId }))
      ) {
        return finish([]);
      }
      const me = { nameEn: own.nameEn, nameAr: own.nameAr };
      for (const r of await this.requests.listForEmployee(ctx.employeeId)) {
        if (matchesAnyField([r.title], q)) hits.push(requestHit(r, null));
      }
      for (const l of await this.leave.listForEmployee(ctx.employeeId)) {
        if (matchesAnyField([l.ref, me.nameEn, me.nameAr], q)) {
          hits.push(leaveHit(l, { id: l.employeeId, ...me }));
        }
      }
      return finish(hits);
    }

    // Staff → cross-client; client manager → their own company; anyone else 403.
    const scope = scopeOf(ctx);
    const clientNames = new Map<string, Names>(
      scope.kind === 'staff'
        ? (await this.clients.list()).map((c) => [c.id, { nameEn: c.nameEn, nameAr: c.nameAr }])
        : await this.clients
            .getById(scope.clientId)
            .then((c) => (c ? [[c.id, { nameEn: c.nameEn, nameAr: c.nameAr }] as const] : [])),
    );

    // ---- people ---------------------------------------------------------------
    const byIdentifier = looksLikeIdentifier(q);
    const idMatches: IdKind[] = [];
    const people =
      scope.kind === 'staff'
        ? can('employee.read')
          ? await this.employees.list()
          : []
        : (await this.config.isEnabled('flag.client-self-service', { clientId: scope.clientId }))
          ? await this.employees.listByClient(scope.clientId)
          : [];
    // Identifiers: staff with govdata.read only — never client managers.
    const mayMatchIds = scope.kind === 'staff' && can('govdata.read') && byIdentifier;
    for (const p of people) {
      let matchedOn: MatchedOn | null = null;
      if (matchesAnyField([p.nameEn, p.nameAr], q)) matchedOn = 'name';
      else if (mayMatchIds) {
        const key = idKey(q);
        const found = IDENTIFIERS.find(([field]) => {
          const v = p[field];
          return typeof v === 'string' && v && idKey(v).includes(key);
        });
        if (found) {
          matchedOn = found[1];
          idMatches.push(found[1]);
        }
      }
      if (matchedOn) {
        hits.push({
          kind: 'person',
          id: p.id,
          nameEn: p.nameEn,
          nameAr: p.nameAr,
          jobTitleEn: p.jobTitleEn ?? null,
          jobTitleAr: p.jobTitleAr ?? null,
          client: clientNames.get(p.clientId) ?? null,
          matchedOn,
        });
      }
    }

    // ---- clients (staff) --------------------------------------------------------
    if (scope.kind === 'staff' && can('client.read')) {
      for (const [id, n] of clientNames) {
        if (matchesAnyField([n.nameEn, n.nameAr], q)) hits.push({ kind: 'client', id, ...n });
      }
    }

    // ---- procedures (staff with gro.read) ------------------------------------------
    if (scope.kind === 'staff' && can('gro.read')) {
      const procs = await this.gro.list();
      const names = await this.employees.namesOf(procs.map((p) => p.employeeId));
      for (const p of procs) {
        const who = names.get(p.employeeId);
        if (matchesAnyField([p.referenceNumber, who?.nameEn, who?.nameAr], q)) {
          hits.push({
            kind: 'procedure',
            id: p.id,
            type: p.type,
            status: p.status,
            reference: p.referenceNumber ?? null,
            employee: who ? { id: p.employeeId, ...who } : null,
          });
        }
      }
    }

    // ---- tasks (staff; own/assigned unless task.read-all — the Tasks rule) ----------
    if (scope.kind === 'staff' && can('task.read')) {
      const rows = await this.tasks.list(
        can('task.read-all') ? {} : { scopeUserId: ctx?.actorId ?? undefined },
      );
      for (const t of rows) {
        if (matchesAnyField([t.title], q)) hits.push({ kind: 'task', id: t.id, title: t.title, status: t.status });
      }
    }

    // ---- requests and leave, on the caller's own path ----------------------------------
    if (can('request.read')) {
      const rows =
        scope.kind === 'staff' ? await this.requests.list() : await this.requests.listForClient(scope.clientId);
      for (const r of rows) {
        if (matchesAnyField([r.title], q)) hits.push(requestHit(r, clientNames.get(r.clientId) ?? null));
      }
    }
    if (can('leave.read')) {
      const rows = scope.kind === 'staff' ? await this.leave.list() : await this.leave.listForClient(scope.clientId);
      const names = await this.employees.namesOf(rows.map((l) => l.employeeId));
      for (const l of rows) {
        const who = names.get(l.employeeId);
        if (who && matchesAnyField([l.ref, who.nameEn, who.nameAr], q)) {
          hits.push(leaveHit(l, { id: l.employeeId, ...who }));
        }
      }
    }

    // ADR-015 §4: an identifier lookup that found someone is recorded — the act,
    // the kind of identifier and its last four digits, never the full number.
    if (idMatches.length > 0) {
      await this.prisma.$transaction((tx) =>
        this.audit.record(tx, {
          resource: 'search',
          action: 'identifier-lookup',
          after: {
            identifierKinds: [...new Set(idMatches)],
            last4: idKey(q).slice(-4),
            matched: idMatches.length,
          },
        }),
      );
    }

    return finish(hits);
  }
}

function finish(hits: SearchHit[]): SearchResponse {
  return { hits: hits.slice(0, MAX_HITS), truncated: hits.length > MAX_HITS };
}

function requestHit(
  r: { id: string; title: string; type: string; status: string },
  client: Names | null,
): SearchHit {
  return { kind: 'request', id: r.id, title: r.title, type: r.type, status: r.status, client };
}

function leaveHit(
  l: { id: string; ref: string; type: LeaveType; status: LeaveStatus },
  employee: { id: string } & Names,
): SearchHit {
  return { kind: 'leave', id: l.id, ref: l.ref, type: l.type, status: l.status, employee };
}
