import { Module } from '@nestjs/common';
import { UsersService } from './application/users.service';
import { PasswordService } from './application/password.service';
import { SessionsService } from './application/sessions.service';
import { AuthController } from './api/auth.controller';
import { SessionMiddleware } from './api/session.middleware';

@Module({
  controllers: [AuthController],
  providers: [UsersService, PasswordService, SessionsService, SessionMiddleware],
  exports: [UsersService, PasswordService, SessionsService, SessionMiddleware],
})
export class AuthModule {}
