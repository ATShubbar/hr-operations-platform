import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
} from '@nestjs/common';
import { RequirePermission } from '../../../auth/permissions.decorator';
import { requestContext } from '../../../context/request-context';
import { ScopedPrismaService } from '../../../prisma/scoped-prisma.service';
import { AuditService } from '../../audit/public-api';

// Client-scoped exemplar endpoint (WS-18): the contract every client-scoped
// endpoint follows — client identity comes from the request context (set by
// auth), data access goes through ScopedPrismaService only.
@Controller('scope-check')
export class ScopeCheckController {
  constructor(
    private readonly scoped: ScopedPrismaService,
    private readonly audit: AuditService,
  ) {}

  @RequirePermission('scope-check.read')
  @Get()
  async list() {
    const clientId = requestContext.get()?.clientId;
    if (!clientId) throw new ForbiddenException('No client scope on request');
    return this.scoped.forClient(clientId).coreScopeCheck.findMany();
  }

  // Write exemplar (AUDIT-03): the mutation and its audit entry are written in
  // ONE client-scoped transaction, so they commit or roll back together. This
  // is the pattern every future client-scoped write copies — and the reason
  // this route is registered as an audited write (test/audit/audited-writes).
  @RequirePermission('scope-check.create')
  @Post()
  @HttpCode(201)
  async create(@Body() body: unknown) {
    const clientId = requestContext.get()?.clientId;
    if (!clientId) throw new ForbiddenException('No client scope on request');
    const note = this.parseNote(body);

    return this.scoped.transaction(clientId, async (tx) => {
      const row = await tx.coreScopeCheck.create({ data: { clientId, note } });
      await this.audit.record(tx, {
        resource: 'scope-check',
        action: 'create',
        after: { id: row.id, note: row.note, clientId: row.clientId },
      });
      return row;
    });
  }

  private parseNote(body: unknown): string {
    const note = (body as { note?: unknown })?.note;
    if (typeof note !== 'string' || note.trim().length === 0 || note.length > 200) {
      throw new BadRequestException('note must be a non-empty string (max 200 chars)');
    }
    return note;
  }
}
