-- LEAVE-03 (ADR-014): the ledger for balances.

-- Leave crossing 31 December is split by day (owner decision): filing writes ONE
-- entry per leave year it touches, so a request may have two entries — unique
-- per (request, year) instead of per request.
DROP INDEX "lv_leave_entries_request_id_key";
CREATE UNIQUE INDEX "lv_leave_entries_request_id_leave_year_key" ON "lv_leave_entries"("request_id", "leave_year");

-- The 1 January carry-over credit is written by the system, not a person.
ALTER TABLE "lv_leave_entries" ALTER COLUMN "created_by_user_id" DROP NOT NULL;

-- At most ONE carry-over credit per employee per leave year: the job can run
-- again (a retry, a manual run after the scheduled one) and never double-credit.
CREATE UNIQUE INDEX "lv_leave_entries_one_carry_per_year"
  ON "lv_leave_entries"("employee_id", "leave_year") WHERE kind = 'carried';
