// Scheduling constants for the document-expiry engine (EXP-02).

// The feature flag (CONF-04 catalog) that gates the AUTOMATIC daily run. The
// engine ships dormant — an admin flips this on to activate scheduled scanning.
// (The manual POST /expiry/scan trigger is not gated by it.)
export const DOCUMENT_EXPIRY_FLAG = 'flag.document-expiry-alerts';

// One repeatable job, upserted by id so re-bootstrapping never duplicates it.
export const DAILY_SCAN_SCHEDULER_ID = 'document-expiry:daily';
export const SCAN_JOB_NAME = 'daily-scan';

// 06:00 every day, pinned to KSA local time — before the workday, so alerts are
// waiting when staff arrive regardless of server timezone.
export const DAILY_SCAN_CRON = '0 6 * * *';
export const SCAN_TIMEZONE = 'Asia/Riyadh';
