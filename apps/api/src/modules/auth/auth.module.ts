import { Module } from '@nestjs/common';
import { UsersService } from './application/users.service';
import { PasswordService } from './application/password.service';
import { SessionsService } from './application/sessions.service';
import { AuthController } from './api/auth.controller';
import { SessionMiddleware } from './api/session.middleware';
import { PolicyService } from './application/policy.service';
import { MfaService } from './application/mfa.service';
import { StaffUsersService } from './application/staff-users.service';
import { StaffUsersController } from './api/staff-users.controller';
import { AuditModule } from '../audit/public-api';

@Module({
  // AuditModule: staff-user mutations write their audit entry in the same
  // transaction (AUDIT-03), exactly as client-user management does.
  imports: [AuditModule],
  controllers: [AuthController, StaffUsersController],
  providers: [
    UsersService,
    PasswordService,
    SessionsService,
    SessionMiddleware,
    PolicyService,
    MfaService,
    StaffUsersService,
  ],
  exports: [
    UsersService,
    PasswordService,
    SessionsService,
    SessionMiddleware,
    PolicyService,
    StaffUsersService,
  ],
})
export class AuthModule {}
