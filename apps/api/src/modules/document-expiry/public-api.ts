// Public surface of the document-expiry module (ADR-003; ACTION-PLAN 3.4).
// EXP-02 (the daily schedule + manual trigger) drives ExpiryScanService.scan().
export { DocumentExpiryModule } from './document-expiry.module';
export { ExpiryScanService, type ExpiryScanResult } from './application/expiry-scan.service';
