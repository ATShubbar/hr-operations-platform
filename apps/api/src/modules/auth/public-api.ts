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
export type { CreateClientRepUserInput, CreateStaffUserInput } from './domain/user';
