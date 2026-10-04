-- LEAVE-01 (ADR-014): leave requests and the balance ledger.
--
-- Three audiences, each fenced AT THE DATABASE to the moves it may make — the
-- service enforces the same rules, this is the fail-closed backstop:
--   * app_staff    — PEOPLE&GRO: reads all; raises, approves on the client's
--                    behalf, files, writes the ledger. No DELETE (corrections
--                    are a later card).
--   * app_client   — a client manager, own company only (client_isolation):
--                    raises for its own employees, approves/declines/withdraws
--                    PENDING requests, can never file or touch the ledger.
--   * app_employee — one employee (employee_id): reads their own leave, raises
--                    for themselves, withdraws what THEY raised while pending.

-- The human reference (LV-0001…). Created before the table whose default uses it.
CREATE SEQUENCE "lv_leave_requests_ref_seq";

-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('annual', 'sick', 'maternity', 'paternity', 'marriage', 'bereavement', 'hajj', 'emergency', 'unpaid');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('pending', 'approved', 'declined', 'withdrawn', 'filed');

-- CreateEnum
CREATE TYPE "LeaveEntryKind" AS ENUM ('taken', 'carried');

-- CreateTable
CREATE TABLE "lv_leave_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ref" TEXT NOT NULL DEFAULT ('LV-'::text || lpad((nextval('lv_leave_requests_ref_seq'::regclass))::text, 4, '0'::text)),
    "client_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "type" "LeaveType" NOT NULL,
    "start_date" DATE NOT NULL,
    "days" INTEGER NOT NULL,
    "end_date" DATE NOT NULL,
    "details" TEXT,
    "status" "LeaveStatus" NOT NULL DEFAULT 'pending',
    "raised_by_user_id" UUID NOT NULL,
    "raised_by_employee_id" UUID,
    "decided_by_user_id" UUID,
    "decided_at" TIMESTAMP(3),
    "decided_on_behalf" BOOLEAN NOT NULL DEFAULT false,
    "filed_by_user_id" UUID,
    "filed_at" TIMESTAMP(3),
    "withdrawn_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lv_leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lv_leave_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "request_id" UUID,
    "kind" "LeaveEntryKind" NOT NULL,
    "type" "LeaveType" NOT NULL,
    "start_date" DATE,
    "end_date" DATE,
    "days" INTEGER NOT NULL,
    "leave_year" INTEGER NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lv_leave_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lv_leave_requests_ref_key" ON "lv_leave_requests"("ref");

-- CreateIndex
CREATE INDEX "lv_leave_requests_client_id_idx" ON "lv_leave_requests"("client_id");

-- CreateIndex
CREATE INDEX "lv_leave_requests_employee_id_idx" ON "lv_leave_requests"("employee_id");

-- CreateIndex
CREATE INDEX "lv_leave_requests_status_idx" ON "lv_leave_requests"("status");

-- CreateIndex
CREATE UNIQUE INDEX "lv_leave_entries_request_id_key" ON "lv_leave_entries"("request_id");

-- CreateIndex
CREATE INDEX "lv_leave_entries_client_id_idx" ON "lv_leave_entries"("client_id");

-- CreateIndex
CREATE INDEX "lv_leave_entries_employee_id_leave_year_idx" ON "lv_leave_entries"("employee_id", "leave_year");


ALTER SEQUENCE "lv_leave_requests_ref_seq" OWNED BY "lv_leave_requests"."ref";

-- ---- Integrity ---------------------------------------------------------------
ALTER TABLE "lv_leave_requests"
  ADD CONSTRAINT "lv_leave_requests_days_chk" CHECK (days BETWEEN 1 AND 365),
  -- Calendar days (ADR-014): the end date is derived, never chosen.
  ADD CONSTRAINT "lv_leave_requests_end_chk" CHECK (end_date = start_date + (days - 1)),
  -- Each status carries the facts that put it there.
  ADD CONSTRAINT "lv_leave_requests_decided_chk" CHECK (
    status NOT IN ('approved', 'declined', 'filed')
    OR (decided_by_user_id IS NOT NULL AND decided_at IS NOT NULL)),
  ADD CONSTRAINT "lv_leave_requests_filed_chk" CHECK (
    status <> 'filed' OR (filed_by_user_id IS NOT NULL AND filed_at IS NOT NULL)),
  ADD CONSTRAINT "lv_leave_requests_withdrawn_chk" CHECK (
    status <> 'withdrawn' OR withdrawn_at IS NOT NULL);

ALTER TABLE "lv_leave_entries"
  ADD CONSTRAINT "lv_leave_entries_days_chk" CHECK (days > 0),
  -- Taken leave comes from a filed request and has dates; a carried credit has neither.
  ADD CONSTRAINT "lv_leave_entries_kind_chk" CHECK (
    (kind = 'taken' AND request_id IS NOT NULL AND start_date IS NOT NULL AND end_date IS NOT NULL)
    OR (kind = 'carried' AND request_id IS NULL AND type = 'annual'));

-- ---- Staff ---------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON "lv_leave_requests" TO app_staff;
GRANT SELECT, INSERT ON "lv_leave_entries" TO app_staff;
GRANT USAGE, SELECT ON SEQUENCE "lv_leave_requests_ref_seq" TO app_staff, app_client, app_employee;

ALTER TABLE "lv_leave_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lv_leave_entries" ENABLE ROW LEVEL SECURITY;

CREATE POLICY staff_full_access ON "lv_leave_requests"
  FOR ALL TO app_staff USING (true) WITH CHECK (true);
CREATE POLICY staff_full_access ON "lv_leave_entries"
  FOR ALL TO app_staff USING (true) WITH CHECK (true);

-- ---- Client managers (own company) ----------------------------------------------
-- UPDATE only on the columns a decision or a withdrawal writes — never the
-- filing columns, the dates, the employee or the on-behalf flag.
GRANT SELECT, INSERT ON "lv_leave_requests" TO app_client;
GRANT UPDATE ("status", "decided_by_user_id", "decided_at", "withdrawn_at", "updated_at")
  ON "lv_leave_requests" TO app_client;
GRANT SELECT ON "lv_leave_entries" TO app_client;

CREATE POLICY client_isolation ON "lv_leave_requests"
  FOR ALL TO app_client
  USING (client_id = NULLIF(current_setting('app.client_id', true), '')::uuid)
  WITH CHECK (client_id = NULLIF(current_setting('app.client_id', true), '')::uuid);

-- A new request is pending and undecided, and is for one of THIS company's
-- employees (the subquery runs under the client's own emp_employees policy, so
-- another company's employee is simply not there).
CREATE POLICY client_raise ON "lv_leave_requests"
  AS RESTRICTIVE FOR INSERT TO app_client
  WITH CHECK (
        status = 'pending'
    AND decided_by_user_id IS NULL AND decided_at IS NULL AND NOT decided_on_behalf
    AND filed_by_user_id IS NULL AND filed_at IS NULL AND withdrawn_at IS NULL
    AND raised_by_employee_id IS NULL
    AND EXISTS (SELECT 1 FROM emp_employees e WHERE e.id = employee_id)
  );

-- A client manager decides or withdraws only PENDING requests, and can only
-- move them to approved / declined / withdrawn — filing is PEOPLE&GRO's.
CREATE POLICY client_decide ON "lv_leave_requests"
  AS RESTRICTIVE FOR UPDATE TO app_client
  USING (status = 'pending')
  WITH CHECK (status IN ('approved', 'declined', 'withdrawn'));

CREATE POLICY client_isolation ON "lv_leave_entries"
  FOR SELECT TO app_client
  USING (client_id = NULLIF(current_setting('app.client_id', true), '')::uuid);

-- ---- Employees (one record) -----------------------------------------------------
GRANT SELECT, INSERT ON "lv_leave_requests" TO app_employee;
GRANT UPDATE ("status", "withdrawn_at", "updated_at") ON "lv_leave_requests" TO app_employee;
GRANT SELECT ON "lv_leave_entries" TO app_employee;

-- Every leave request ABOUT me, whoever raised it — it is my leave.
CREATE POLICY employee_self ON "lv_leave_requests"
  FOR SELECT TO app_employee
  USING (employee_id = NULLIF(current_setting('app.employee_id', true), '')::uuid);

-- I raise only for myself, for the company on MY record, pending and undecided.
CREATE POLICY employee_raise ON "lv_leave_requests"
  FOR INSERT TO app_employee
  WITH CHECK (
        employee_id = NULLIF(current_setting('app.employee_id', true), '')::uuid
    AND raised_by_employee_id = NULLIF(current_setting('app.employee_id', true), '')::uuid
    AND client_id = (
          SELECT e.client_id FROM emp_employees e
          WHERE e.id = NULLIF(current_setting('app.employee_id', true), '')::uuid
        )
    AND status = 'pending'
    AND decided_by_user_id IS NULL AND decided_at IS NULL AND NOT decided_on_behalf
    AND filed_by_user_id IS NULL AND filed_at IS NULL AND withdrawn_at IS NULL
  );

-- I withdraw only what I raised, only while it is pending, only to `withdrawn`.
CREATE POLICY employee_withdraw ON "lv_leave_requests"
  FOR UPDATE TO app_employee
  USING (
        employee_id = NULLIF(current_setting('app.employee_id', true), '')::uuid
    AND raised_by_employee_id = NULLIF(current_setting('app.employee_id', true), '')::uuid
    AND status = 'pending'
  )
  WITH CHECK (
        employee_id = NULLIF(current_setting('app.employee_id', true), '')::uuid
    AND raised_by_employee_id = NULLIF(current_setting('app.employee_id', true), '')::uuid
    AND status = 'withdrawn'
  );

CREATE POLICY employee_self ON "lv_leave_entries"
  FOR SELECT TO app_employee
  USING (employee_id = NULLIF(current_setting('app.employee_id', true), '')::uuid);
