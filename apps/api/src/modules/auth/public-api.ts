// Public surface of the auth module (ADR-003).
export { AuthModule } from './auth.module';
export { UsersService } from './application/users.service';
export type { CreateClientRepUserInput, CreateStaffUserInput } from './domain/user';
