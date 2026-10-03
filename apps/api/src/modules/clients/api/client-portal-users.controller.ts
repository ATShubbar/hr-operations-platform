import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  createClientUserRequestSchema,
  updateClientUserRequestSchema,
  type ClientUserListResponse,
  type ClientUserResponse,
} from '@hr/contracts';
import { RequirePermission } from '../../../auth/permissions.decorator';
import { scopeOf } from '../../../auth/scope';
import { requestContext } from '../../../context/request-context';
import type { AuthUserModel as AuthUser } from '../../../generated/prisma/models';
import { ClientsService } from '../application/clients.service';
import { ClientUsersService } from '../application/client-users.service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Client portal users, managed BY STAFF (ROLE-02, ADR-013) — the only path
// since ROLE-03 retired the client-rep one (`/client-users`, CLIENT-03), whose
// company came from the caller's session. Here it comes from the PATH, because
// an Administrator works across every client.
//
// STAFF ONLY, checked before anything else. No client role holds
// `client-user.*` any more, so the guard alone already refuses client reps —
// `scopeOf` stays as the second wall: a future grant to a client role must not
// silently let one address ANOTHER company by changing the path.
@Controller('clients/:clientId/users')
export class ClientPortalUsersController {
  constructor(
    private readonly clients: ClientsService,
    private readonly clientUsers: ClientUsersService,
  ) {}

  @RequirePermission('client-user.read')
  @Get()
  async list(@Param('clientId') clientId: string): Promise<ClientUserListResponse> {
    await this.assertStaffAndClient(clientId);
    const users = await this.clientUsers.list(clientId);
    return { users: users.map(toClientUserResponse) };
  }

  @RequirePermission('client-user.read')
  @Get(':id')
  async get(
    @Param('clientId') clientId: string,
    @Param('id') id: string,
  ): Promise<ClientUserResponse> {
    await this.assertStaffAndClient(clientId);
    assertUserId(id);
    const user = await this.clientUsers.get(id, clientId);
    if (!user) throw new NotFoundException('Client user not found');
    return toClientUserResponse(user);
  }

  @RequirePermission('client-user.create')
  @Post()
  @HttpCode(201)
  async invite(
    @Param('clientId') clientId: string,
    @Body() body: unknown,
  ): Promise<ClientUserResponse> {
    await this.assertStaffAndClient(clientId);
    const parsed = createClientUserRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid client user payload');
    return toClientUserResponse(await this.clientUsers.invite(clientId, parsed.data));
  }

  @RequirePermission('client-user.update')
  @Patch(':id')
  async update(
    @Param('clientId') clientId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<ClientUserResponse> {
    await this.assertStaffAndClient(clientId);
    assertUserId(id);
    const parsed = updateClientUserRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid client user payload');
    const user = await this.clientUsers.update(clientId, id, parsed.data);
    if (!user) throw new NotFoundException('Client user not found');
    return toClientUserResponse(user);
  }

  @RequirePermission('client-user.delete')
  @Delete(':id')
  async deactivate(
    @Param('clientId') clientId: string,
    @Param('id') id: string,
  ): Promise<ClientUserResponse> {
    await this.assertStaffAndClient(clientId);
    assertUserId(id);
    const user = await this.clientUsers.deactivate(clientId, id);
    if (!user) throw new NotFoundException('Client user not found');
    return toClientUserResponse(user);
  }

  // Principal first (a client rep learns nothing about which ids exist), then
  // the company: unknown → 404. A user id from a DIFFERENT company is a 404 too —
  // the service looks users up by (id, clientId), never by id alone.
  private async assertStaffAndClient(clientId: string): Promise<void> {
    if (scopeOf(requestContext.get()).kind !== 'staff') {
      throw new ForbiddenException('Staff only');
    }
    if (!UUID_RE.test(clientId) || !(await this.clients.getById(clientId))) {
      throw new NotFoundException('Client not found');
    }
  }
}

function assertUserId(id: string): void {
  if (!UUID_RE.test(id)) throw new NotFoundException('Client user not found');
}

// One response shape (CLIENT-03's, unchanged).
function toClientUserResponse(user: AuthUser): ClientUserResponse {
  return {
    id: user.id,
    email: user.email,
    role: user.role as ClientUserResponse['role'],
    status: user.status as ClientUserResponse['status'],
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
