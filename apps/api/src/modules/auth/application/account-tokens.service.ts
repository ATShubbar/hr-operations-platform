import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import type { Prisma } from '../../../generated/prisma/client';

export type AccountTokenPurpose = 'invite' | 'reset';

// How long a link works (SS-06a). An invitation waits for someone to read an
// email; a reset is requested by the person about to use it.
export const INVITE_TTL_SECONDS = 7 * 24 * 60 * 60;
export const RESET_TTL_SECONDS = 60 * 60;

// One-time account tokens (SS-06a). The raw token is 32 random bytes, base64url —
// it exists only in the email. The database keeps its SHA-256 hash, so a leaked
// table yields no usable link (a fast hash is right here: the input is 256 bits
// of randomness, not a guessable password).
@Injectable()
export class AccountTokensService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Issue a token, cancelling the user's older UNUSED tokens of the same purpose
   * so only the newest link works. Takes an optional transaction so an
   * invitation's account, token and audit entry commit together.
   */
  async issue(
    userId: string,
    purpose: AccountTokenPurpose,
    ttlSeconds: number,
    tx?: Prisma.TransactionClient,
  ): Promise<string> {
    const db = tx ?? this.prisma;
    const raw = randomBytes(32).toString('base64url');
    // EXPIRE the older unused links rather than delete them: they stop working
    // just the same, but the rows stay countable — deleting them is what broke
    // the reset throttle on SS-06a's first run (the count never passed 1).
    await db.authAccountToken.updateMany({
      where: { userId, purpose, usedAt: null, expiresAt: { gt: new Date() } },
      data: { expiresAt: new Date() },
    });
    await db.authAccountToken.create({
      data: {
        userId,
        purpose,
        tokenHash: hash(raw),
        expiresAt: new Date(Date.now() + ttlSeconds * 1000),
      },
    });
    return raw;
  }

  /**
   * Consume a token: valid only if it exists, is unused and unexpired. The
   * update is conditional on `usedAt IS NULL`, so two simultaneous uses of one
   * link cannot both succeed.
   */
  async consume(
    raw: string,
    tx?: Prisma.TransactionClient,
  ): Promise<{ userId: string; purpose: AccountTokenPurpose } | null> {
    const db = tx ?? this.prisma;
    const row = await db.authAccountToken.findUnique({ where: { tokenHash: hash(raw) } });
    if (!row || row.usedAt || row.expiresAt <= new Date()) return null;
    const claimed = await db.authAccountToken.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) return null;
    return { userId: row.userId, purpose: row.purpose };
  }

  /** Cancel every unused token of a user — on deactivation, links die with the account. */
  async revokeAll(userId: string, tx?: Prisma.TransactionClient): Promise<void> {
    await (tx ?? this.prisma).authAccountToken.updateMany({
      where: { userId, usedAt: null, expiresAt: { gt: new Date() } },
      data: { expiresAt: new Date() },
    });
  }

  /** How many tokens of a purpose were issued to a user since a moment (reset throttle). */
  countIssuedSince(userId: string, purpose: AccountTokenPurpose, since: Date): Promise<number> {
    return this.prisma.authAccountToken.count({
      where: { userId, purpose, createdAt: { gte: since } },
    });
  }
}

function hash(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}
