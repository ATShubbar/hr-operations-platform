import { Controller, HttpCode, Post } from '@nestjs/common';
import type { ExpiryScanResponse } from '@hr/contracts';
import { RequirePermission } from '../../../auth/permissions.decorator';
import { ExpiryScanService } from '../application/expiry-scan.service';

// Manual expiry-scan trigger (EXP-02). The scan normally runs on the daily
// repeatable job; this lets an admin force a run for ops or verification. Unlike
// the scheduled path it is NOT flag-gated — an explicit admin action overrides
// the on/off feature flag. The scan is system-wide (cross-client), so this is a
// staff admin endpoint returning only a run summary (no client data).
@Controller('expiry')
export class ExpiryController {
  constructor(private readonly scan: ExpiryScanService) {}

  @RequirePermission('expiry.run')
  @Post('scan')
  @HttpCode(200)
  run(): Promise<ExpiryScanResponse> {
    return this.scan.scan(new Date());
  }
}
