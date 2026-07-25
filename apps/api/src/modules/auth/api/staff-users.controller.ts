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
  createStaffUserRequestSchema,
  updateStaffUserRequestSchema,
  type StaffDirectoryResponse,
  type StaffUserListResponse,
  type StaffUserResponse,
} from '@hr/contracts';
import { RequirePermission } from '../../../auth/permissions.decorator';
import { requestContext } from '../../../context/request-context';
import type { AuthUserModel as AuthUser } from '../../../generated/prisma/models';
import { StaffUsersService } from '../application/staff-users.service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Staff user management + the name directory (UX-10b).
//
// TWO PERMISSIONS, TWO SHAPES — the reason this controller exists rather than a
// single list endpoint:
//
//   staff-user.read       → the management view (System Admin, Company Admin).
//                           Email, status, MFA enrollment, timestamps.
//   staff-user.directory  → id + display name + role, and nothing else. Held by
//                           EVERY staff role, because turning an assignee id
//                           into a person is not administering an account.
//
// Route order matters: `directory` is declared before `:id` so the literal wins.
@Controller('staff-users')
export class StaffUsersController {
  constructor(private readonly staffUsers: StaffUsersService) {}

  // The narrow one. Every staff role holds this.
  @RequirePermission('staff-user.directory')
  @Get('directory')
  async directory(): Promise<StaffDirectoryResponse> {
    const users = await this.staffUsers.list();
    return {
      users: users.map((u) => ({
        id: u.id,
        displayName: u.displayName,
        role: u.role as StaffDirectoryResponse['users'][number]['role'],
      })),
    };
  }

  @RequirePermission('staff-user.read')
  @Get()
  async list(): Promise<StaffUserListResponse> {
    const users = await this.staffUsers.list();
    return { users: users.map(toResponse) };
  }

  @RequirePermission('staff-user.read')
  @Get(':id')
  async get(@Param('id') id: string): Promise<StaffUserResponse> {
    this.assertUuid(id);
    const user = await this.staffUsers.get(id);
    if (!user) throw new NotFoundException('Staff user not found');
    return toResponse(user);
  }

  @RequirePermission('staff-user.create')
  @Post()
  @HttpCode(201)
  async create(@Body() body: unknown): Promise<StaffUserResponse> {
    const parsed = createStaffUserRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid staff user payload');
    return toResponse(await this.staffUsers.create(parsed.data));
  }

  @RequirePermission('staff-user.update')
  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: unknown): Promise<StaffUserResponse> {
    this.assertUuid(id);
    const parsed = updateStaffUserRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid staff user payload');
    const user = await this.staffUsers.update(this.actorId(), id, parsed.data);
    if (!user) throw new NotFoundException('Staff user not found');
    return toResponse(user);
  }

  // Deactivate, not delete — see the service.
  @RequirePermission('staff-user.delete')
  @Delete(':id')
  async deactivate(@Param('id') id: string): Promise<StaffUserResponse> {
    this.assertUuid(id);
    const user = await this.staffUsers.deactivate(this.actorId(), id);
    if (!user) throw new NotFoundException('Staff user not found');
    return toResponse(user);
  }

  private actorId(): string {
    const id = requestContext.get()?.actorId;
    if (!id) throw new ForbiddenException('Authentication required');
    return id;
  }

  private assertUuid(id: string): void {
    if (!UUID_RE.test(id)) throw new NotFoundException('Staff user not found');
  }
}

function toResponse(user: AuthUser): StaffUserResponse {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role as StaffUserResponse['role'],
    status: user.status as StaffUserResponse['status'],
    // Whether MFA is enrolled, never the secret.
    mfaEnrolled: user.mfaSecret !== null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
