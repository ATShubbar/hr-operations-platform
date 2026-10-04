import { Controller, Get } from '@nestjs/common';
import type { AccessGroup, AccessLevel, AccessResponse, RoleId } from '@hr/contracts';
import { RequirePermission } from '../../../auth/permissions.decorator';
import { scopeOf } from '../../../auth/scope';
import { requestContext } from '../../../context/request-context';
import { CLIENT_ROLES, ROLE_PERMISSIONS, STAFF_ROLES, type RoleName } from '../../auth/public-api';
import { PORTAL_EMPLOYEE_VISIBILITY, staffVisibility } from '../domain/employee-view';

// GET /access (DS-21) — what each role sees on an employee record, for the
// Settings → Access table. Read-only, and DERIVED from the rules the API enforces:
//
//   staff roles     → the role's bundle through staffVisibility() (what the
//                     employees controller enforces with)
//   client manager  → PORTAL_EMPLOYEE_VISIBILITY (what the portal enforces with),
//                     own company only
//   employee        → the self view (toSelfProfileResponse: own record, with
//                     identifier numbers and pay — ADR-011; pinned field for
//                     field by the SS-03 spec)
//
// Clients and calendar rows come straight from client.read / calendar.read and
// portal.read. Gated by config.read-self, which every role holds; scopeOf()
// refuses the employee principal (Settings is not part of an employee's
// surface) — and the isolation harness's employee fence checks that.

const GROUPS: readonly AccessGroup[] = [
  'profile',
  'expiries',
  'identifiers',
  'pay',
  'clients',
  'calendar',
];

function accessFor(role: RoleName): Record<AccessGroup, AccessLevel> {
  const has = (p: string) => (ROLE_PERMISSIONS[role] as readonly string[]).includes(p);

  if ((STAFF_ROLES as readonly string[]).includes(role)) {
    const vis = staffVisibility(has);
    const reads = has('employee.read');
    return {
      profile: reads ? 'full' : 'none',
      expiries: !reads ? 'none' : vis.govdata !== 'none' ? 'full' : 'hidden',
      identifiers: !reads ? 'none' : vis.govdata === 'full' ? 'full' : 'hidden',
      pay: !reads ? 'none' : vis.salary ? 'full' : 'hidden',
      clients: has('client.read') ? 'full' : 'none',
      calendar: has('calendar.read') ? 'full' : 'none',
    };
  }

  if ((CLIENT_ROLES as readonly string[]).includes(role)) {
    const vis = PORTAL_EMPLOYEE_VISIBILITY;
    const portal = has('portal.read');
    const own = (visible: boolean): AccessLevel =>
      !portal ? 'none' : visible ? 'own_company' : 'hidden';
    return {
      profile: own(true),
      expiries: own(vis.govdata !== 'none'),
      identifiers: own(vis.govdata === 'full'),
      pay: own(vis.salary),
      clients: portal ? 'own_company' : 'none',
      calendar: has('calendar.read') ? 'own_company' : 'none',
    };
  }

  // The employee: their own record through the self view, nothing else.
  const self = has('self-service.read') ? 'own_record' : 'none';
  return {
    profile: self,
    expiries: self,
    identifiers: self,
    pay: self,
    clients: 'none',
    calendar: 'none',
  };
}

@Controller('access')
export class AccessController {
  @RequirePermission('config.read-self')
  @Get()
  list(): AccessResponse {
    scopeOf(requestContext.get()); // staff or client rep; anyone else → 403
    const roles = Object.keys(ROLE_PERMISSIONS) as RoleName[];
    const table = new Map(roles.map((r) => [r, accessFor(r)]));
    return {
      roles: roles as RoleId[],
      rows: GROUPS.map((group) => ({
        group,
        access: Object.fromEntries(roles.map((r) => [r, table.get(r)![group]])) as Record<
          RoleId,
          AccessLevel
        >,
      })),
    };
  }
}
