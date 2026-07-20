import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import { loginRequestSchema, type LoginResponse } from '@hr/contracts';
import { Public } from '../../../auth/permissions.decorator';
import { PasswordService } from '../application/password.service';
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  SessionsService,
} from '../application/sessions.service';
import { UsersService } from '../application/users.service';

// Pre-computed argon2id hash of a random string: verified against when the
// email is unknown so response timing doesn't reveal account existence.
const DUMMY_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHRzb21lc2FsdA$h1DHhCJTdZ0uTJq5PGUvpZlAY82JqjbSk9Mh/lHrLNo';

const INVALID_CREDENTIALS = 'Invalid credentials';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionsService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const parsed = loginRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid login payload');

    const user = await this.users.findByEmail(parsed.data.email);
    // Same error + a real argon2 verify either way: no user enumeration by
    // message or by timing.
    const hash = user?.passwordHash ?? DUMMY_HASH;
    const valid = await this.passwords.verify(hash, parsed.data.password);
    if (!user || !valid || user.status !== 'active') {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const sessionId = await this.sessions.create({
      userId: user.id,
      principalType: user.principalType,
      role: user.role,
      clientId: user.clientId,
    });
    res.cookie(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_TTL_SECONDS * 1000,
      path: '/',
    });
    return { userId: user.id, principalType: user.principalType };
  }
}
