import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';

// Server-side sessions in Redis (ADR-002/ADR-008). Redis is never source of
// truth: losing it logs everyone out, nothing more. Session ids are opaque
// UUIDs; the cookie carries only the id.

export const SESSION_COOKIE = 'hr_session';
export const SESSION_TTL_SECONDS = 12 * 60 * 60;
// Limited sessions (MFA challenge / forced enrollment) are short-lived.
export const PENDING_TTL_SECONDS = 5 * 60;

export type SessionMfaState = 'full' | 'enroll_required' | 'challenge';

export interface SessionData {
  userId: string;
  principalType: 'staff' | 'client_rep' | 'employee';
  role: string;
  clientId: string | null;
  // Set only for `employee` principals (SS-01). Optional so sessions created
  // before this field existed still parse — they are staff or client reps.
  employeeId?: string | null;
  mfa: SessionMfaState;
  // Secret generated at enroll time; promoted to auth_users.mfa_secret only
  // after a successful verify — never persisted unverified.
  pendingSecret?: string;
}

@Injectable()
export class SessionsService implements OnModuleDestroy {
  private readonly redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6380');

  async create(data: SessionData): Promise<string> {
    const id = randomUUID();
    const ttl = data.mfa === 'full' ? SESSION_TTL_SECONDS : PENDING_TTL_SECONDS;
    // The session and its entry in the user's index are written together. The
    // index is what lets an account change END sessions (SS-06a): before it, a
    // disabled account kept working on any session it already held — measured,
    // 200 on /auth/me and on data routes for the rest of the 12-hour TTL.
    await this.redis
      .multi()
      .set(this.key(id), JSON.stringify(data), 'EX', ttl)
      .sadd(this.userKey(data.userId), id)
      .expire(this.userKey(data.userId), SESSION_TTL_SECONDS)
      .exec();
    return id;
  }

  async update(id: string, data: SessionData): Promise<void> {
    const ttl = data.mfa === 'full' ? SESSION_TTL_SECONDS : PENDING_TTL_SECONDS;
    await this.redis.set(this.key(id), JSON.stringify(data), 'EX', ttl);
  }

  async get(id: string): Promise<SessionData | null> {
    const raw = await this.redis.get(this.key(id));
    return raw ? (JSON.parse(raw) as SessionData) : null;
  }

  async destroy(id: string): Promise<void> {
    const session = await this.get(id);
    const tx = this.redis.multi().del(this.key(id));
    if (session) tx.srem(this.userKey(session.userId), id);
    await tx.exec();
  }

  /**
   * End EVERY session of one account (SS-06a). Called when an account is
   * disabled or its role changes — the session caches the role, so a demotion
   * or deactivation must not wait for the session to expire. Index entries
   * whose session already expired are harmless: deleting a missing key is a
   * no-op. Returns how many index entries were cleared.
   */
  async destroyAllForUser(userId: string): Promise<number> {
    const ids = await this.redis.smembers(this.userKey(userId));
    const tx = this.redis.multi();
    for (const id of ids) tx.del(this.key(id));
    tx.del(this.userKey(userId));
    await tx.exec();
    return ids.length;
  }

  private key(id: string): string {
    return `sess:${id}`;
  }

  private userKey(userId: string): string {
    return `user-sess:${userId}`;
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}
