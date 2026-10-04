-- THREAD-04 (ADR-016): the service-level clock pauses while a request waits on
-- its requester. `info_needed_since` records when the wait began; it travels with
-- `info_needed` exactly like `info_returns_to` (THREAD-03).

-- AlterTable
ALTER TABLE "req_requests" ADD COLUMN "info_needed_since" TIMESTAMP(3);

-- Requests already waiting (from THREAD-03, before this column) start their
-- pause now — nothing earlier was recorded.
UPDATE "req_requests" SET "info_needed_since" = CURRENT_TIMESTAMP WHERE "status" = 'info_needed';

ALTER TABLE "req_requests"
  ADD CONSTRAINT "req_requests_info_needed_since_chk"
    CHECK ((status = 'info_needed') = (info_needed_since IS NOT NULL));

-- The employee's reply clears it along with the status (employee_reply_returns,
-- THREAD-03). Still no due_date: the due date's extension is the SYSTEM's,
-- written on the staff connection after the reply commits.
GRANT UPDATE (info_needed_since) ON "req_requests" TO app_employee;
