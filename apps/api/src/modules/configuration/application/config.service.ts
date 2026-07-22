import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { SettingLevel } from '@hr/contracts';
import { PrismaService } from '../../../prisma/prisma.service';
import { requestContext } from '../../../context/request-context';
import type { Prisma } from '../../../generated/prisma/client';
import { AuditService } from '../../audit/public-api';
import {
  CATALOG,
  FLAG_DEFS,
  getSettingDef,
  isFlagKey,
  settingAllowsLevel,
  type SettingDef,
} from '../domain/catalog';

// Configuration read/resolve + system-level write (CONF-01). Resolution here is
// the system level only: effective value = stored system override ?? the
// catalog's coded default. CONF-02/03 wrap this with client- and user-level
// overrides (user → client → system precedence). Every module reads settings
// through this service — hardcoding a convention elsewhere is a review defect.
@Injectable()
export class ConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // Effective value of one setting at the system level.
  async get(key: string): Promise<unknown> {
    const def = this.requireDef(key);
    const row = await this.prisma.systemSetting.findUnique({ where: { key } });
    return row ? row.value : def.default;
  }

  // Effective values for every catalog setting (system level). Unknown stored
  // keys are ignored — the catalog is authoritative for what exists.
  async getAll(): Promise<Record<string, unknown>> {
    const rows = await this.prisma.systemSetting.findMany();
    const overrides = new Map(rows.map((r) => [r.key, r.value as unknown]));
    const out: Record<string, unknown> = {};
    for (const def of CATALOG) {
      out[def.key] = overrides.has(def.key) ? overrides.get(def.key) : def.default;
    }
    return out;
  }

  // Set (upsert) a system-level override. Unknown key → 404; a value that fails
  // the setting's catalog schema → 400. Both are errors, never a silent
  // fallback (architecture.md: "attempting to override is a Configuration API
  // error"). Audited in the same transaction (AUDIT-03); settings are
  // non-sensitive so the value is recorded.
  async setSystem(key: string, value: unknown): Promise<{ key: string; value: unknown }> {
    const def = this.requireDef(key);
    if (!settingAllowsLevel(def, 'system')) {
      throw new BadRequestException(`Setting '${key}' has no system level`);
    }
    const parsed = def.schema.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException(`Invalid value for setting '${key}'`);
    }
    const nextValue = parsed.data as Prisma.InputJsonValue;

    return this.prisma.$transaction(async (tx) => {
      const before = await tx.systemSetting.findUnique({ where: { key } });
      const row = await tx.systemSetting.upsert({
        where: { key },
        create: { key, value: nextValue },
        update: { value: nextValue },
      });
      await this.audit.record(tx, {
        resource: 'config',
        action: 'system-set',
        // Omit `before` on first-time set (create has no prior state).
        before: before
          ? { key, level: 'system', value: before.value as Prisma.InputJsonValue }
          : undefined,
        after: { key, level: 'system', value: row.value as Prisma.InputJsonValue },
      });
      return { key: row.key, value: row.value as unknown };
    });
  }

  // ---- per-client level (CONF-02) ----

  // Effective settings for a client: client override wins over the system value
  // (client → system precedence), but only for settings that DECLARE a client
  // level — a stray override on a system-only setting is ignored, never applied.
  async getAllForClient(clientId: string): Promise<Record<string, unknown>> {
    const effective = await this.getAll();
    const overrides = await this.prisma.clientSetting.findMany({ where: { clientId } });
    const map = new Map(overrides.map((o) => [o.key, o.value as unknown]));
    for (const def of CATALOG) {
      if (settingAllowsLevel(def, 'client') && map.has(def.key)) {
        effective[def.key] = map.get(def.key);
      }
    }
    return effective;
  }

  // Set (upsert) a per-client override. A setting that does not declare a client
  // level → 400 (architecture.md: overriding a non-permitted level is an error,
  // not a silent fallback); unknown key → 404; bad value → 400. Audited, scoped
  // to the affected client.
  async setClient(
    clientId: string,
    key: string,
    value: unknown,
  ): Promise<{ key: string; value: unknown }> {
    const def = this.requireDef(key);
    if (!settingAllowsLevel(def, 'client')) {
      throw new BadRequestException(`Setting '${key}' has no client level`);
    }
    const parsed = def.schema.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException(`Invalid value for setting '${key}'`);
    }
    const nextValue = parsed.data as Prisma.InputJsonValue;

    return this.prisma.$transaction(async (tx) => {
      const before = await tx.clientSetting.findUnique({
        where: { clientId_key: { clientId, key } },
      });
      const row = await tx.clientSetting.upsert({
        where: { clientId_key: { clientId, key } },
        create: { clientId, key, value: nextValue },
        update: { value: nextValue },
      });
      await this.audit.record(tx, {
        resource: 'config',
        action: 'client-set',
        clientId,
        before: before
          ? { clientId, key, level: 'client', value: before.value as Prisma.InputJsonValue }
          : undefined,
        after: { clientId, key, level: 'client', value: row.value as Prisma.InputJsonValue },
      });
      return { key: row.key, value: row.value as unknown };
    });
  }

  // Clear a per-client override, reverting the setting to the system value.
  // Unknown key → 404. Absent override → idempotent no-op (no audit). Returns
  // the now-effective (system) value.
  async clearClient(
    clientId: string,
    key: string,
  ): Promise<{ key: string; level: 'system'; value: unknown }> {
    this.requireDef(key);
    const existing = await this.prisma.clientSetting.findUnique({
      where: { clientId_key: { clientId, key } },
    });
    if (existing) {
      await this.prisma.$transaction(async (tx) => {
        await tx.clientSetting.delete({ where: { clientId_key: { clientId, key } } });
        await this.audit.record(tx, {
          resource: 'config',
          action: 'client-clear',
          clientId,
          before: {
            clientId,
            key,
            level: 'client',
            value: existing.value as Prisma.InputJsonValue,
          },
        });
      });
    }
    return { key, level: 'system', value: await this.get(key) };
  }

  // ---- per-user level (CONF-03) — the caller's OWN preferences ----
  //
  // Actor identity comes from the request context, NEVER from input — a user can
  // only ever read/write their own preferences. clientId (present for a client-
  // rep, null for staff) drives the middle resolution tier.

  // Fully-resolved effective settings for the caller: user → client → system.
  async getEffectiveForActor(): Promise<Record<string, unknown>> {
    const { actorId, clientId } = this.actor();
    // client → system (or just system when the caller has no client)
    const effective = clientId ? await this.getAllForClient(clientId) : await this.getAll();
    const overrides = await this.prisma.userSetting.findMany({ where: { userId: actorId } });
    const map = new Map(overrides.map((o) => [o.key, o.value as unknown]));
    for (const def of CATALOG) {
      if (settingAllowsLevel(def, 'user') && map.has(def.key)) {
        effective[def.key] = map.get(def.key);
      }
    }
    return effective;
  }

  // Set (upsert) one of the caller's own preferences. A setting without a user
  // level → 400; unknown key → 404; bad value → 400. Audited (actor/client
  // default from the request context).
  async setUser(key: string, value: unknown): Promise<{ key: string; value: unknown }> {
    const { actorId } = this.actor();
    const def = this.requireDef(key);
    if (!settingAllowsLevel(def, 'user')) {
      throw new BadRequestException(`Setting '${key}' has no user level`);
    }
    const parsed = def.schema.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException(`Invalid value for setting '${key}'`);
    }
    const nextValue = parsed.data as Prisma.InputJsonValue;

    return this.prisma.$transaction(async (tx) => {
      const before = await tx.userSetting.findUnique({
        where: { userId_key: { userId: actorId, key } },
      });
      const row = await tx.userSetting.upsert({
        where: { userId_key: { userId: actorId, key } },
        create: { userId: actorId, key, value: nextValue },
        update: { value: nextValue },
      });
      await this.audit.record(tx, {
        resource: 'config',
        action: 'user-set',
        before: before
          ? { userId: actorId, key, level: 'user', value: before.value as Prisma.InputJsonValue }
          : undefined,
        after: { userId: actorId, key, level: 'user', value: row.value as Prisma.InputJsonValue },
      });
      return { key: row.key, value: row.value as unknown };
    });
  }

  // Clear one of the caller's own preferences, reverting to the lower tier
  // (client if the caller has a client override, else system). Unknown key →
  // 404; absent → idempotent no-op (no audit).
  async clearUser(
    key: string,
  ): Promise<{ key: string; level: SettingLevel; value: unknown }> {
    const { actorId, clientId } = this.actor();
    this.requireDef(key);
    const existing = await this.prisma.userSetting.findUnique({
      where: { userId_key: { userId: actorId, key } },
    });
    if (existing) {
      await this.prisma.$transaction(async (tx) => {
        await tx.userSetting.delete({ where: { userId_key: { userId: actorId, key } } });
        await this.audit.record(tx, {
          resource: 'config',
          action: 'user-clear',
          before: {
            userId: actorId,
            key,
            level: 'user',
            value: existing.value as Prisma.InputJsonValue,
          },
        });
      });
    }
    return { key, ...(await this.effectiveBelowUser(key, clientId)) };
  }

  // The effective {level, value} of a setting ignoring the user tier — i.e. what
  // a cleared user preference reverts to (client override if any, else system).
  private async effectiveBelowUser(
    key: string,
    clientId: string | null,
  ): Promise<{ level: SettingLevel; value: unknown }> {
    const def = this.requireDef(key);
    if (clientId && settingAllowsLevel(def, 'client')) {
      const c = await this.prisma.clientSetting.findUnique({
        where: { clientId_key: { clientId, key } },
      });
      if (c) return { level: 'client', value: c.value as unknown };
    }
    return { level: 'system', value: await this.get(key) };
  }

  // ---- feature flags (CONF-04) — flags are boolean settings under `flag.`,
  // resolved through the same client → system machinery (no user tier). This is
  // the read surface other modules use to gate features. ----

  // Is a feature flag on? Resolves the flag's effective boolean at the given
  // client scope (or system when no clientId). Non-flag key → error (a caller
  // asking `isEnabled('calendar.display')` is a bug, not a false).
  async isEnabled(flagKey: string, opts?: { clientId?: string | null }): Promise<boolean> {
    if (!isFlagKey(flagKey)) {
      throw new BadRequestException(`'${flagKey}' is not a feature flag`);
    }
    this.requireDef(flagKey);
    const { value } = await this.effectiveBelowUser(flagKey, opts?.clientId ?? null);
    return value === true;
  }

  // All flags resolved to booleans at the given scope (system when null).
  async flagsFor(clientId: string | null): Promise<Record<string, boolean>> {
    const out: Record<string, boolean> = {};
    for (const def of FLAG_DEFS) {
      const { value } = await this.effectiveBelowUser(def.key, clientId);
      out[def.key] = value === true;
    }
    return out;
  }

  // The effective UI language for a specific user (NOTIF-03) — their per-user
  // override if set, else the system default. Resolves OUTSIDE a request context
  // (a worker sending email to a recipient who is not the caller).
  async resolveLanguageForUser(userId: string): Promise<'ar' | 'en'> {
    const override = await this.prisma.userSetting.findUnique({
      where: { userId_key: { userId, key: 'ui.language' } },
    });
    const value = override ? (override.value as unknown) : await this.get('ui.language');
    return value === 'en' ? 'en' : 'ar';
  }

  private actor(): { actorId: string; clientId: string | null } {
    const ctx = requestContext.get();
    if (!ctx?.actorId) throw new UnauthorizedException('No authenticated actor');
    return { actorId: ctx.actorId, clientId: ctx.clientId ?? null };
  }

  private requireDef(key: string): SettingDef {
    const def = getSettingDef(key);
    if (!def) throw new NotFoundException(`Unknown setting '${key}'`);
    return def;
  }
}
