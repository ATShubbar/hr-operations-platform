import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { auditQuerySchema, type AuditListResponse } from '@hr/contracts';
import { RequirePermission } from '../../../auth/permissions.decorator';
import { AuditQueryService } from '../application/audit-query.service';

// Audit log read (AUDIT-04). audit.read is held by the Administrator and the
// Auditor (v1.7 matrix); the deny-by-default guard enforces it, so no role check
// lives here. Cross-client by design — every client's audit trail.
@Controller('audit')
export class AuditController {
  constructor(private readonly auditQuery: AuditQueryService) {}

  @RequirePermission('audit.read')
  @Get()
  async list(@Query() query: unknown): Promise<AuditListResponse> {
    const parsed = auditQuerySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException('Invalid audit query');
    return this.auditQuery.list(parsed.data);
  }
}
