import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { AuthUserModel as AuthUser } from '../../../generated/prisma/models';
import type { CreateClientRepUserInput, CreateStaffUserInput } from '../domain/user';

// Identity access goes through the STAFF Prisma path only — auth_users is a
// system table with no app_client grants (see the auth_users migration).
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  createStaffUser(input: CreateStaffUserInput): Promise<AuthUser> {
    return this.prisma.authUser.create({
      data: {
        email: input.email.toLowerCase(),
        passwordHash: input.passwordHash,
        principalType: 'staff',
      },
    });
  }

  createClientRepUser(input: CreateClientRepUserInput): Promise<AuthUser> {
    return this.prisma.authUser.create({
      data: {
        email: input.email.toLowerCase(),
        passwordHash: input.passwordHash,
        principalType: 'client_rep',
        clientId: input.clientId,
      },
    });
  }

  findByEmail(email: string): Promise<AuthUser | null> {
    return this.prisma.authUser.findUnique({ where: { email: email.toLowerCase() } });
  }
}
