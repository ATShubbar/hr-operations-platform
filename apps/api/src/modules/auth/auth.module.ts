import { Module } from '@nestjs/common';
import { UsersService } from './application/users.service';
import { PasswordService } from './application/password.service';
import { SessionsService } from './application/sessions.service';
import { AuthController } from './api/auth.controller';
import { SessionMiddleware } from './api/session.middleware';
import { PolicyService } from './application/policy.service';
import { MfaService } from './application/mfa.service';

@Module({
  controllers: [AuthController],
  providers: [
    UsersService,
    PasswordService,
    SessionsService,
    SessionMiddleware,
    PolicyService,
    MfaService,
  ],
  exports: [
    UsersService,
    PasswordService,
    SessionsService,
    SessionMiddleware,
    PolicyService,
  ],
})
export class AuthModule {}
