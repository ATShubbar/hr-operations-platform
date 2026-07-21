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
import { requestContext } from '../../../context/request-context';
import type { AuthUserModel as AuthUser } from '../../../generated/prisma/models';
import { ClientUsersService } from '../application/client-users.service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Client portal user management (CLIENT-03). Client-scoped: the caller's own
// client comes from the request context (a client-rep session), NEVER from
// input, so a Client Admin can only ever manage its own client's users. The
// permissions (client-user.*) are held by Client Admin alone (the guard
// enforces it); staff have no client scope, so they are rejected here too.
@Controller('client-users')
export class ClientUsersController {
  constructor(private readonly clientUsers: ClientUsersService) {}

  @RequirePermission('client-user.read')
  @Get()
  async list(): Promise<ClientUserListResponse> {
    const users = await this.clientUsers.list(this.clientId());
    return { users: users.map(toResponse) };
  }

  @RequirePermission('client-user.read')
  @Get(':id')
  async get(@Param('id') id: string): Promise<ClientUserResponse> {
    this.assertUuid(id);
    const user = await this.clientUsers.get(id, this.clientId());
    if (!user) throw new NotFoundException('Client user not found');
    return toResponse(user);
  }

  @RequirePermission('client-user.create')
  @Post()
  @HttpCode(201)
  async invite(@Body() body: unknown): Promise<ClientUserResponse> {
    const parsed = createClientUserRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid client user payload');
    const user = await this.clientUsers.invite(this.clientId(), parsed.data);
    return toResponse(user);
  }

  @RequirePermission('client-user.update')
  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: unknown): Promise<ClientUserResponse> {
    this.assertUuid(id);
    const parsed = updateClientUserRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid client user payload');
    const user = await this.clientUsers.update(this.clientId(), id, parsed.data);
    if (!user) throw new NotFoundException('Client user not found');
    return toResponse(user);
  }

  @RequirePermission('client-user.delete')
  @Delete(':id')
  async deactivate(@Param('id') id: string): Promise<ClientUserResponse> {
    this.assertUuid(id);
    const user = await this.clientUsers.deactivate(this.clientId(), id);
    if (!user) throw new NotFoundException('Client user not found');
    return toResponse(user);
  }

  private clientId(): string {
    const id = requestContext.get()?.clientId;
    if (!id) throw new ForbiddenException('Client scope required');
    return id;
  }

  private assertUuid(id: string): void {
    if (!UUID_RE.test(id)) throw new NotFoundException('Client user not found');
  }
}

function toResponse(user: AuthUser): ClientUserResponse {
  return {
    id: user.id,
    email: user.email,
    role: user.role as ClientUserResponse['role'],
    status: user.status as ClientUserResponse['status'],
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
