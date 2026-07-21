import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  loginRequestSchema,
  mfaCodeRequestSchema,
  type LoginResponse,
  type MeResponse,
  type MfaEnrollResponse,
} from '@hr/contracts';
import { Public, RequirePermission } from '../../../auth/permissions.decorator';
import { requestContext } from '../../../context/request-context';
import { readCookie } from './session.middleware';
import { PasswordService } from '../application/password.service';
import { MfaService } from '../application/mfa.service';
import { PolicyService } from '../application/policy.service';
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  SessionsService,
  type SessionData,
} from '../application/sessions.service';
import { UsersService } from '../application/users.service';

// Pre-computed argon2id hash of a random string: verified against when the
// email is unknown so response timing doesn't reveal account existence.
const DUMMY_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHRzb21lc2FsdA$h1DHhCJTdZ0uTJq5PGUvpZlAY82JqjbSk9Mh/lHrLNo';

const INVALID_CREDENTIALS = 'Invalid credentials';

// Architecture rule (ADR-002): MFA is REQUIRED for admin roles.
const MFA_REQUIRED_ROLES = new Set(['system_admin', 'company_admin']);

@Controller('auth')
export class AuthController {
  constructor(
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionsService,
    private readonly mfa: MfaService,
    private readonly policy: PolicyService,
  ) {}

  // Current authenticated actor (AUTH-08). @Public to the guard, but returns
  // 401 unless the session middleware resolved a FULL session into the context
  // (same self-checking shape as the MFA endpoints). Feeds the web session
  // provider: route guard + role-aware UI.
  @Public()
  @Get('me')
  me(): MeResponse {
    const ctx = requestContext.get();
    if (!ctx?.actorId || !ctx.role || !ctx.principalType) {
      throw new UnauthorizedException('Authentication required');
    }
    return {
      userId: ctx.actorId,
      principalType: ctx.principalType,
      role: ctx.role,
      clientId: ctx.clientId,
      permissions: this.policy.permissionsFor(ctx.role),
    };
  }

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
    const hash = user?.passwordHash ?? DUMMY_HASH;
    const valid = await this.passwords.verify(hash, parsed.data.password);
    if (!user || !valid || user.status !== 'active') {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const base: SessionData = {
      userId: user.id,
      principalType: user.principalType,
      role: user.role,
      clientId: user.clientId,
      mfa: 'full',
    };

    if (user.mfaSecret) {
      // Enrolled: credentials alone earn only a challenge session.
      await this.setSession(res, { ...base, mfa: 'challenge' });
      return { userId: user.id, principalType: user.principalType, mfaRequired: true };
    }

    if (MFA_REQUIRED_ROLES.has(user.role)) {
      // Admins must enroll before they get a full session.
      await this.setSession(res, { ...base, mfa: 'enroll_required' });
      return { userId: user.id, principalType: user.principalType, mfaEnrollRequired: true };
    }

    await this.setSession(res, base);
    return { userId: user.id, principalType: user.principalType };
  }

  // ---- MFA endpoints (@Public + manual session-state checks: limited
  // sessions are unauthenticated to the guard by design) ----

  @Public()
  @Post('mfa/enroll')
  @HttpCode(200)
  async enroll(@Req() req: Request): Promise<MfaEnrollResponse> {
    const { sessionId, session } = await this.requireSession(req);
    if (session.mfa === 'challenge') {
      throw new UnauthorizedException('Complete the MFA challenge first');
    }
    const user = await this.users.findById(session.userId);
    if (!user) throw new UnauthorizedException('Session user gone');
    if (user.mfaSecret) throw new BadRequestException('MFA already enrolled');

    const secret = this.mfa.generateSecret();
    await this.sessions.update(sessionId, { ...session, pendingSecret: secret });
    return { otpauthUri: this.mfa.provisioningUri(user.email, secret) };
  }

  @Public()
  @Post('mfa/verify')
  @HttpCode(200)
  async verifyEnrollment(
    @Req() req: Request,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ enrolled: true }> {
    const code = this.parseCode(body);
    const { sessionId, session } = await this.requireSession(req);
    if (!session.pendingSecret) throw new BadRequestException('No enrollment in progress');
    if (!this.mfa.verify(code, session.pendingSecret)) {
      throw new UnauthorizedException('Invalid code');
    }

    await this.users.setMfaSecret(session.userId, session.pendingSecret);
    // Promote to a full session (covers the admin enroll_required path).
    await this.sessions.destroy(sessionId);
    await this.setSession(res, { ...session, mfa: 'full', pendingSecret: undefined });
    return { enrolled: true };
  }

  @Public()
  @Post('mfa/challenge')
  @HttpCode(200)
  async challenge(
    @Req() req: Request,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ authenticated: true }> {
    const code = this.parseCode(body);
    const { sessionId, session } = await this.requireSession(req);
    if (session.mfa !== 'challenge') throw new BadRequestException('No challenge pending');
    const user = await this.users.findById(session.userId);
    if (!user?.mfaSecret) throw new UnauthorizedException('Session user gone');
    if (!this.mfa.verify(code, user.mfaSecret)) {
      throw new UnauthorizedException('Invalid code');
    }

    await this.sessions.destroy(sessionId);
    await this.setSession(res, { ...session, mfa: 'full' });
    return { authenticated: true };
  }

  // Real revocation (the point of server-side sessions): after this, the
  // cookie is worthless everywhere, immediately.
  @RequirePermission('session.end')
  @Post('logout')
  @HttpCode(200)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ loggedOut: true }> {
    const sessionId = readCookie(req.headers.cookie, SESSION_COOKIE);
    if (sessionId) await this.sessions.destroy(sessionId);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    return { loggedOut: true };
  }

  private async requireSession(
    req: Request,
  ): Promise<{ sessionId: string; session: SessionData }> {
    const sessionId = readCookie(req.headers.cookie, SESSION_COOKIE);
    const session = sessionId ? await this.sessions.get(sessionId) : null;
    if (!sessionId || !session) throw new UnauthorizedException('Authentication required');
    return { sessionId, session };
  }

  private parseCode(body: unknown): string {
    const parsed = mfaCodeRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid code payload');
    return parsed.data.code;
  }

  private async setSession(res: Response, data: SessionData): Promise<void> {
    const sessionId = await this.sessions.create(data);
    res.cookie(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_TTL_SECONDS * 1000,
      path: '/',
    });
  }
}
