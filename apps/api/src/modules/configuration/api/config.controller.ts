import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
} from '@nestjs/common';
import {
  setSettingRequestSchema,
  type ConfigCatalogResponse,
  type ConfigEffectiveResponse,
  type SettingValueResponse,
} from '@hr/contracts';
import { RequirePermission } from '../../../auth/permissions.decorator';
import { ClientsService } from '../../clients/public-api';
import { CATALOG } from '../domain/catalog';
import { ConfigService } from '../application/config.service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Configuration API (CONF-01). Reads (effective settings + catalog) need
// config.read (held by all staff); the system-level write needs config.write
// (System Admin only, per the matrix — deny-by-default guard enforces it, no
// role check here). Per-key PATCH so each change is one validated value and one
// audit entry; CONF-02/03 mirror the shape at /config/client/:key and
// /config/me/:key.
@Controller('config')
export class ConfigController {
  constructor(
    private readonly config: ConfigService,
    private readonly clients: ClientsService,
  ) {}

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

  // ---- per-client level (CONF-02) — staff-managed (Company Admin) for an
  // explicit client; the client never sets their own (architecture.md). ----

  @RequirePermission('config.read')
  @Get('client/:clientId')
  async clientEffective(@Param('clientId') clientId: string): Promise<ConfigEffectiveResponse> {
    await this.requireClient(clientId);
    return { settings: await this.config.getAllForClient(clientId) };
  }

  @RequirePermission('config.write-client')
  @Patch('client/:clientId/:key')
  async setClient(
    @Param('clientId') clientId: string,
    @Param('key') key: string,
    @Body() body: unknown,
  ): Promise<SettingValueResponse> {
    await this.requireClient(clientId);
    const parsed = setSettingRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid payload (expected { value })');
    const row = await this.config.setClient(clientId, key, parsed.data.value);
    return { key: row.key, level: 'client', value: row.value };
  }

  @RequirePermission('config.write-client')
  @Delete('client/:clientId/:key')
  async clearClient(
    @Param('clientId') clientId: string,
    @Param('key') key: string,
  ): Promise<SettingValueResponse> {
    await this.requireClient(clientId);
    return this.config.clearClient(clientId, key);
  }

  private async requireClient(clientId: string): Promise<void> {
    if (!UUID_RE.test(clientId) || !(await this.clients.getById(clientId))) {
      throw new NotFoundException('Unknown client');
    }
  }

  // ---- per-user level (CONF-03) — the caller's OWN preferences. Any
  // authenticated principal; actor identity comes from the session, never the
  // URL, so a user can only ever touch their own preferences. ----

  @RequirePermission('config.read-self')
  @Get('me')
  async myEffective(): Promise<ConfigEffectiveResponse> {
    return { settings: await this.config.getEffectiveForActor() };
  }

  @RequirePermission('config.write-self')
  @Patch('me/:key')
  async setMine(@Param('key') key: string, @Body() body: unknown): Promise<SettingValueResponse> {
    const parsed = setSettingRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid payload (expected { value })');
    const row = await this.config.setUser(key, parsed.data.value);
    return { key: row.key, level: 'user', value: row.value };
  }

  @RequirePermission('config.write-self')
  @Delete('me/:key')
  async clearMine(@Param('key') key: string): Promise<SettingValueResponse> {
    return this.config.clearUser(key);
  }
}
