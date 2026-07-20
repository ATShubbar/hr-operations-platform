import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';

// Server-side sessions in Redis (ADR-002/ADR-008). Redis is never source of
// truth: losing it logs everyone out, nothing more. Session ids are opaque
// UUIDs; the cookie carries only the id.

export const SESSION_COOKIE = 'hr_session';
export const SESSION_TTL_SECONDS = 12 * 60 * 60;

export interface SessionData {
  userId: string;
  principalType: 'staff' | 'client_rep';
  role: string;
  clientId: string | null;
}

@Injectable()
export class SessionsService implements OnModuleDestroy {
  private readonly redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6380');

  async create(data: SessionData): Promise<string> {
    const id = randomUUID();
    await this.redis.set(this.key(id), JSON.stringify(data), 'EX', SESSION_TTL_SECONDS);
    return id;
  }

  async get(id: string): Promise<SessionData | null> {
    const raw = await this.redis.get(this.key(id));
    return raw ? (JSON.parse(raw) as SessionData) : null;
  }

  async destroy(id: string): Promise<void> {
    await this.redis.del(this.key(id));
  }

  private key(id: string): string {
    return `sess:${id}`;
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}
