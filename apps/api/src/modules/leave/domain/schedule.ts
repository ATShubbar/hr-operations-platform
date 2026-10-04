// The yearly carry-over (LEAVE-03): ten past midnight on 1 January, Riyadh time —
// the first minutes of the new leave year. One scheduler id, upserted, so a
// restart never duplicates it.
export const CARRY_OVER_SCHEDULER_ID = 'leave:carry-over';
export const CARRY_OVER_JOB_NAME = 'carry-over';
export const CARRY_OVER_CRON = '10 0 1 1 *';
export const CARRY_OVER_TIMEZONE = 'Asia/Riyadh';
