// Public surface of the auth module (ADR-003).
export { AuthModule } from './auth.module';
export { UsersService, type ClientRepStatus } from './application/users.service';
export { PasswordService } from './application/password.service';
export {
  AccountTokensService,
  INVITE_TTL_SECONDS,
  RESET_TTL_SECONDS,
  type AccountTokenPurpose,
} from './application/account-tokens.service';
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
export type {
  CreateClientRepUserInput,
  CreateEmployeeUserInput,
  CreateStaffUserInput,
} from './domain/user';
export { UAT_ORIGIN, mfaSwitchedOffForUat } from './domain/uat-mfa';
