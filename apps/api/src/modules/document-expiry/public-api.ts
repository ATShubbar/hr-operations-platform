// Public surface of the document-expiry module (ADR-003; ACTION-PLAN 3.4).
// EXP-02 (the daily schedule + manual trigger) drives ExpiryScanService.scan().
export { DocumentExpiryModule } from './document-expiry.module';
export { ExpiryScanService, type ExpiryScanResult } from './application/expiry-scan.service';
// The worker (daily schedule + queue processor). MainModule loads it in the real
// process; the schedule e2e opts it in — never ordinary specs (producer/worker
// split). The scheduling constants let that e2e assert the daily job registered.
export { ExpiryWorkerModule } from './expiry-worker.module';
// Exported so the schedule e2e can drive the processor directly (flag-gate) and
// assert the daily job — the module-boundary lint rule bars deep test imports.
export { ExpiryScanProcessor } from './api/expiry-scan.processor';
export {
  DAILY_SCAN_SCHEDULER_ID,
  DOCUMENT_EXPIRY_FLAG,
  SCAN_JOB_NAME,
} from './domain/schedule';
