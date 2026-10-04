import { Controller, Get } from '@nestjs/common';
import type { RoleKind, RoleListResponse } from '@hr/contracts';
import { RequirePermission } from '../../../auth/permissions.decorator';
import { UsersService } from '../application/users.service';
import {
  CLIENT_ROLES,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  STAFF_ROLES,
  type RoleName,
} from '../domain/permissions';

// The built-in roles, read-only (DS-19) — for the Roles and permissions screen.
//
// The response IS the code's ROLE_PERMISSIONS (no copy, no second definition):
// the same bundles role-matrix.e2e-spec pins to architecture.md v1.7, so the
// matrix on screen cannot drift from what the policy enforces. Gated by
// staff-user.read — the Administrator and the Auditor. Nothing here edits a role;
// editable roles are a later feature, with safeguards (owner decision).
const KIND = (role: RoleName): RoleKind =>
  (STAFF_ROLES as readonly string[]).includes(role)
    ? 'staff'
    : (CLIENT_ROLES as readonly string[]).includes(role)
      ? 'client'
      : 'employee';

@Controller('roles')
export class RolesController {
  constructor(private readonly users: UsersService) {}

  @RequirePermission('staff-user.read')
  @Get()
  async list(): Promise<RoleListResponse> {
    const counts = await this.users.activeCountsByRole();
    return {
      permissions: [...PERMISSIONS],
      roles: (Object.keys(ROLE_PERMISSIONS) as RoleName[]).map((id) => ({
        id,
        kind: KIND(id),
        permissions: [...ROLE_PERMISSIONS[id]],
        accounts: counts.get(id) ?? 0,
      })),
    };
  }
}
