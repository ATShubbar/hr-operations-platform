import { BadRequestException, Body, Controller, Get, Param, Patch } from '@nestjs/common';
import {
  setSettingRequestSchema,
  type ConfigCatalogResponse,
  type ConfigEffectiveResponse,
  type SettingValueResponse,
} from '@hr/contracts';
import { RequirePermission } from '../../../auth/permissions.decorator';
import { CATALOG } from '../domain/catalog';
import { ConfigService } from '../application/config.service';

// Configuration API (CONF-01). Reads (effective settings + catalog) need
// config.read (held by all staff); the system-level write needs config.write
// (System Admin only, per the matrix — deny-by-default guard enforces it, no
// role check here). Per-key PATCH so each change is one validated value and one
// audit entry; CONF-02/03 mirror the shape at /config/client/:key and
// /config/me/:key.
@Controller('config')
export class ConfigController {
  constructor(private readonly config: ConfigService) {}

  @RequirePermission('config.read')
  @Get()
  async effective(): Promise<ConfigEffectiveResponse> {
    return { settings: await this.config.getAll() };
  }

  @RequirePermission('config.read')
  @Get('catalog')
  catalog(): ConfigCatalogResponse {
    return {
      settings: CATALOG.map((d) => ({
        key: d.key,
        levels: [...d.levels],
        default: d.default,
        description: d.description,
      })),
    };
  }

  @RequirePermission('config.write')
  @Patch('system/:key')
  async setSystem(@Param('key') key: string, @Body() body: unknown): Promise<SettingValueResponse> {
    const parsed = setSettingRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid payload (expected { value })');
    const row = await this.config.setSystem(key, parsed.data.value);
    return { key: row.key, level: 'system', value: row.value };
  }
}
