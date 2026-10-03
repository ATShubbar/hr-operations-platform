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
import { ClientsService } from '../application/clients.service';
import { ClientUsersService } from '../application/client-users.service';
import { toClientUserResponse } from './client-users.controller';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Client portal users, managed BY STAFF (ROLE-02, ADR-013). The client-rep
// path (`/client-users`, CLIENT-03) takes the company from the caller's session;
// this one takes it from the PATH, because an Administrator works across every
// client. The two share `ClientUsersService`, so the rules (unique email, audit
// in the same transaction, sessions ended on disable/role change, soft delete)
// cannot drift between them.
//
// STAFF ONLY. Client reps hold the same `client-user.*` permissions today, so
// the permission guard alone would let a Client Admin address ANOTHER company
// by changing the path — `scopeOf` refuses every non-staff principal first.
// ADR-013 moves the capability to Administrators alone (ROLE-03); this card adds
// the staff path before that, so nobody is ever without it.
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
