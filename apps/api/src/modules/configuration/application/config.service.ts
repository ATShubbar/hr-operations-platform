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

  private requireDef(key: string): SettingDef {
    const def = getSettingDef(key);
    if (!def) throw new NotFoundException(`Unknown setting '${key}'`);
    return def;
  }
}
