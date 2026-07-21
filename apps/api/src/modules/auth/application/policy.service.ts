import { Injectable } from '@nestjs/common';
import { PERMISSIONS, ROLE_PERMISSIONS, type RoleName } from '../domain/permissions';

// ADR-002: the single policy decision point. Deny on unknown role, unknown
// permission, or missing grant — never a fall-through allow.
@Injectable()
export class PolicyService {
  can(role: string | null | undefined, permission: string): boolean {
    if (!role) return false;
    if (!(PERMISSIONS as readonly string[]).includes(permission)) return false;
    const granted = ROLE_PERMISSIONS[role as RoleName];
    return granted ? (granted as readonly string[]).includes(permission) : false;
  }

  // The full permission set for a role — the capability list the UI uses to
  // show/hide actions (AUTH-08). Unknown role → no permissions.
  permissionsFor(role: string | null | undefined): string[] {
    if (!role) return [];
    const granted = ROLE_PERMISSIONS[role as RoleName];
    return granted ? [...granted] : [];
  }
}
