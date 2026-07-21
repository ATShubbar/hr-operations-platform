// Public surface of the auth module (ADR-003).
export { AuthModule } from './auth.module';
export { UsersService } from './application/users.service';
export { PasswordService } from './application/password.service';
export {
  SESSION_COOKIE,
  SessionsService,
  type SessionData,
} from './application/sessions.service';
export { SessionMiddleware } from './api/session.middleware';
export { PolicyService } from './application/policy.service';
export { MfaService } from './application/mfa.service';
export {
  CLIENT_ROLES,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  STAFF_ROLES,
  type ClientRole,
  type Permission,
  type RoleName,
  type StaffRole,
} from './domain/permissions';
export type { CreateClientRepUserInput, CreateStaffUserInput } from './domain/user';
