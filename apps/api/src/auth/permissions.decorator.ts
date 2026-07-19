import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'hr:permission';
export const PUBLIC_KEY = 'hr:public';

// Permission names follow the frozen `resource.action` convention
// (architecture.md → Permission naming convention; ADR-002).
export const RequirePermission = (permission: `${string}.${string}`) =>
  SetMetadata(PERMISSION_KEY, permission);

// Explicit opt-out of authentication/authorization. Reserve for endpoints
// that MUST be probed unauthenticated (health/readiness). Every use is a
// review point.
export const Public = () => SetMetadata(PUBLIC_KEY, true);
