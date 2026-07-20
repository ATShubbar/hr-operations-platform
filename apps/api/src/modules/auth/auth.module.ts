import { Module } from '@nestjs/common';
import { UsersService } from './application/users.service';
import { PasswordService } from './application/password.service';
import { SessionsService } from './application/sessions.service';
import { AuthController } from './api/auth.controller';

@Module({
  controllers: [AuthController],
  providers: [UsersService, PasswordService, SessionsService],
  exports: [UsersService, PasswordService, SessionsService],
})
export class AuthModule {}
