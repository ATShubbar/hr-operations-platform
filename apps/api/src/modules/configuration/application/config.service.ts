import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { Prisma } from '../../../generated/prisma/client';
import { AuditService } from '../../audit/public-api';
import { CATALOG, getSettingDef, settingAllowsLevel, type SettingDef } from '../domain/catalog';

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

  private requireDef(key: string): SettingDef {
    const def = getSettingDef(key);
    if (!def) throw new NotFoundException(`Unknown setting '${key}'`);
    return def;
  }
}
