import { describe, expect, it } from 'vitest';
import { ROLE_PERMISSIONS, type Permission, type RoleName } from '../src/modules/auth/public-api';

// ROLE-03 (ADR-013): the architecture.md v1.7 permission matrix, as a test.
//
// Each ROW below is a row of the matrix; each entry says which permissions that
// role holds for it. The union of a role's entries must EQUAL its bundle in
// `permissions.ts` — exactly, both ways — so:
//   - a grant the matrix does not sanction fails here (the "extra" list), and
//   - a matrix cell the code forgot fails here (the "missing" list).
// Read it as the matrix; change it only together with architecture.md.

type Row = Partial<Record<RoleName, readonly Permission[]>>;

const MATRIX: Record<string, Row> = {
  // Own identity — not matrix rows, but every principal needs them.
  'session, own preferences, own notifications': {
    administrator: ['session.end', 'config.read-self', 'config.write-self', 'notification.read'],
    hr_officer: ['session.end', 'config.read-self', 'config.write-self', 'notification.read'],
    gro_officer: ['session.end', 'config.read-self', 'config.write-self', 'notification.read'],
    auditor: ['session.end', 'config.read-self', 'config.write-self', 'notification.read'],
    client_manager: ['session.end', 'config.read-self', 'config.write-self', 'notification.read'],
    employee: ['session.end', 'config.read-self', 'config.write-self', 'notification.read'],
  },
  'staff plumbing (exemplar, colleague directory — UX-10b)': {
    administrator: ['example.read', 'staff-user.directory'],
    hr_officer: ['example.read', 'staff-user.directory'],
    gro_officer: ['example.read', 'staff-user.directory'],
    auditor: ['example.read', 'staff-user.directory'],
  },
  'client plumbing (scope-check exemplar, the portal surface)': {
    client_manager: ['scope-check.read', 'scope-check.create', 'portal.read'],
  },

  'System config & staff users': {
    administrator: [
      'config.read',
      'config.write',
      'config.write-client',
      'staff-user.read',
      'staff-user.create',
      'staff-user.update',
      'staff-user.delete',
    ],
    hr_officer: ['config.read'],
    gro_officer: ['config.read'],
    auditor: ['config.read', 'staff-user.read'],
  },
  'Client companies': {
    administrator: ['client.read', 'client.create', 'client.update', 'client.delete'],
    hr_officer: ['client.read'],
    gro_officer: ['client.read'],
    auditor: ['client.read'],
    // client_manager: R (own) — through portal.read, above.
  },
  'Client portal users': {
    administrator: [
      'client-user.read',
      'client-user.create',
      'client-user.update',
      'client-user.delete',
    ],
    auditor: ['client-user.read'],
  },
  'Employee self-service accounts': {
    administrator: ['employee-user.read', 'employee-user.invite', 'employee-user.update'],
    hr_officer: ['employee-user.read', 'employee-user.invite', 'employee-user.update'],
    auditor: ['employee-user.read'],
  },
  // AUDIT-06 catalog addition (not a matrix change): every staff role that
  // reads employee records reads their curated history.
  'Employee history (curated, no values)': {
    administrator: ['employee.history'],
    hr_officer: ['employee.history'],
    gro_officer: ['employee.history'],
    auditor: ['employee.history'],
  },
  'Employees — core profile': {
    administrator: ['employee.read', 'employee.create', 'employee.update', 'employee.delete'],
    hr_officer: ['employee.read', 'employee.create', 'employee.update'],
    gro_officer: ['employee.read'],
    auditor: ['employee.read'],
    // client_manager: R (own) via portal.read; employee: R (self) via self-service.read.
  },
  'Employees — salary & financial': {
    administrator: ['salary.read', 'salary.update'],
    hr_officer: ['salary.read', 'salary.update'],
    auditor: ['salary.read'],
  },
  'Employees — government data': {
    administrator: ['govdata.read', 'govdata.update'],
    hr_officer: ['govdata.read', 'govdata.update'],
    gro_officer: ['govdata.read', 'govdata.update'],
    auditor: ['govdata.read'],
  },
  Documents: {
    administrator: ['document.read', 'document.upload', 'document.delete', 'expiry.run'],
    hr_officer: ['document.read', 'document.upload', 'document.delete'],
    // CRU, government categories only (document-policy.ts).
    gro_officer: ['document.read', 'document.upload'],
    auditor: ['document.read'],
  },
  Recruitment: {
    administrator: [
      'vacancy.read',
      'vacancy.create',
      'vacancy.update',
      'vacancy.approve',
      'vacancy.delete',
      'candidate.read',
      'candidate.create',
      'candidate.update',
      'candidate.advance',
      'candidate.delete',
    ],
    hr_officer: [
      'vacancy.read',
      'vacancy.create',
      'vacancy.update',
      'vacancy.approve',
      'candidate.read',
      'candidate.create',
      'candidate.update',
      'candidate.advance',
    ],
    gro_officer: [
      'vacancy.read',
      'vacancy.update',
      'candidate.read',
      'candidate.update',
      'candidate.advance',
    ],
    auditor: ['vacancy.read', 'candidate.read'],
    client_manager: ['vacancy.read'], // own vacancies; never candidates
  },
  'GRO workflows': {
    administrator: ['gro.read', 'gro.process'],
    hr_officer: ['gro.read', 'gro.process'],
    gro_officer: ['gro.read', 'gro.process'],
    auditor: ['gro.read'],
    client_manager: ['gro.read'], // own, status only
  },
  // ADR-015 (architecture.md v1.9): every role; results gated per source.
  'Global search': {
    administrator: ['search.read'],
    hr_officer: ['search.read'],
    gro_officer: ['search.read'],
    auditor: ['search.read'],
    client_manager: ['search.read'],
    employee: ['search.read'],
  },
  // ADR-014 (architecture.md v1.8). Employees reach their own leave through
  // /me/leave under self-service.* (already granted by the Requests row).
  Leave: {
    administrator: ['leave.read', 'leave.create', 'leave.approve', 'leave.file', 'leave.withdraw', 'leave.carry-over'],
    hr_officer: ['leave.read', 'leave.create', 'leave.file', 'leave.withdraw'],
    gro_officer: ['leave.read', 'leave.file'],
    auditor: ['leave.read'],
    client_manager: ['leave.read', 'leave.create', 'leave.approve', 'leave.withdraw'], // own company
  },
  Requests: {
    administrator: ['request.read', 'request.create', 'request.update', 'request.process'],
    hr_officer: ['request.read', 'request.create', 'request.update', 'request.process'],
    gro_officer: ['request.read', 'request.process'],
    auditor: ['request.read'],
    client_manager: ['request.read', 'request.create'],
    employee: ['self-service.read', 'self-service.create'], // own file + self-raised
  },
  'Tasks (internal)': {
    administrator: ['task.read', 'task.read-all', 'task.create', 'task.update', 'task.delete'],
    hr_officer: ['task.read', 'task.create', 'task.update'],
    gro_officer: ['task.read', 'task.create', 'task.update'],
    auditor: ['task.read', 'task.read-all'],
  },
  // calendar.read-all lifts update/delete to ALL events, so "write own, read
  // all" is not expressible; HR/GRO follow the prototype's RWCD (ROLE-03).
  Calendar: {
    administrator: [
      'calendar.read',
      'calendar.read-all',
      'calendar.create',
      'calendar.update',
      'calendar.delete',
      'integration.google-calendar',
    ],
    hr_officer: [
      'calendar.read',
      'calendar.read-all',
      'calendar.create',
      'calendar.update',
      'calendar.delete',
      'integration.google-calendar',
    ],
    gro_officer: [
      'calendar.read',
      'calendar.read-all',
      'calendar.create',
      'calendar.update',
      'calendar.delete',
      'integration.google-calendar',
    ],
    auditor: ['calendar.read', 'calendar.read-all'],
  },
  Reports: {
    administrator: ['report.read', 'report.export'],
    auditor: ['report.read'], // reads, never exports
  },
  'Audit logs': {
    administrator: ['audit.read'],
    auditor: ['audit.read'],
  },
  // Employee: the matrix says U (own), but the employee role has never held
  // notification-pref.update (ADR-011 rev. 3 granted only the bell + language).
  // Recorded as a pre-existing gap in ROLE-03's evidence, not changed here.
  'Notification preferences': {
    administrator: ['notification-pref.update'],
    hr_officer: ['notification-pref.update'],
    gro_officer: ['notification-pref.update'],
    auditor: ['notification-pref.update'],
    client_manager: ['notification-pref.update'],
  },
};

const ROLES = Object.keys(ROLE_PERMISSIONS) as RoleName[];

function expectedFor(role: RoleName): Set<Permission> {
  const out = new Set<Permission>();
  for (const row of Object.values(MATRIX)) for (const p of row[role] ?? []) out.add(p);
  return out;
}

describe('Permission matrix v1.7 (ROLE-03, ADR-013)', () => {
  it('has exactly the six roles', () => {
    expect([...ROLES].sort()).toEqual(
      [
        'administrator',
        'auditor',
        'client_manager',
        'employee',
        'gro_officer',
        'hr_officer',
      ].sort(),
    );
  });

  for (const role of ROLES) {
    it(`${role}: the bundle equals the matrix — nothing missing, nothing extra`, () => {
      const granted = new Set(ROLE_PERMISSIONS[role]);
      const expected = expectedFor(role);
      const missing = [...expected].filter((p) => !granted.has(p)).sort();
      const extra = [...granted].filter((p) => !expected.has(p)).sort();
      expect({ missing, extra }).toEqual({ missing: [], extra: [] });
    });
  }

  // The narrowings ADR-013 lists, spelled out so a reader doesn't have to
  // diff the table to see them.
  it('the ADR-013 narrowings hold', () => {
    const has = (r: RoleName, p: Permission) => ROLE_PERMISSIONS[r].includes(p);
    expect(has('hr_officer', 'employee.delete')).toBe(false);
    expect(has('hr_officer', 'report.read')).toBe(false);
    expect(has('gro_officer', 'report.read')).toBe(false);
    expect(has('gro_officer', 'employee.update')).toBe(false);
    expect(has('gro_officer', 'document.delete')).toBe(false);
    expect(has('gro_officer', 'salary.read')).toBe(false);
    expect(has('auditor', 'report.export')).toBe(false);
    // "Changes nothing" — apart from the caller's OWN preferences, which every
    // principal manages (notification-pref.update, config.write-self).
    const OWN = new Set<Permission>([
      'notification-pref.update',
      'config.write-self',
      'session.end',
    ]);
    const auditorWrites = ROLE_PERMISSIONS.auditor.filter(
      (p) =>
        !OWN.has(p) &&
        /\.(create|update|delete|process|approve|advance|upload|invite|export|run|write|write-client)$/.test(
          p,
        ),
    );
    expect(auditorWrites).toEqual([]);
    expect(ROLE_PERMISSIONS.client_manager.some((p) => p.startsWith('client-user.'))).toBe(false);
    expect(has('client_manager', 'request.update')).toBe(false);
    expect(has('client_manager', 'candidate.read')).toBe(false);
  });
});
