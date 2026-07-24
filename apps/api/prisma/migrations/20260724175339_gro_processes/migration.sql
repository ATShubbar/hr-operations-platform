-- CreateEnum
CREATE TYPE "GroProcessType" AS ENUM ('iqama_issue', 'iqama_renewal', 'exit_reentry', 'final_exit', 'profession_change', 'sponsorship_transfer', 'work_permit_renewal', 'other');

-- CreateEnum
CREATE TYPE "GroProcessStatus" AS ENUM ('not_started', 'in_progress', 'submitted', 'approved', 'rejected', 'completed', 'cancelled');

-- CreateTable
CREATE TABLE "gro_processes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "type" "GroProcessType" NOT NULL,
    "status" "GroProcessStatus" NOT NULL DEFAULT 'not_started',
    "reference_number" TEXT,
    "due_date" DATE,
    "assignee_user_id" UUID,
    "notes" TEXT,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gro_processes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gro_processes_client_id_idx" ON "gro_processes"("client_id");

-- CreateIndex
CREATE INDEX "gro_processes_employee_id_idx" ON "gro_processes"("employee_id");

-- CreateIndex
CREATE INDEX "gro_processes_status_idx" ON "gro_processes"("status");

-- CreateIndex
CREATE INDEX "gro_processes_due_date_idx" ON "gro_processes"("due_date");

-- GRO-01 client-scoped table checklist (apps/api/src/modules/README.md). Clients
-- may READ their own GRO processes (status only — permission matrix), so like
-- rec_vacancies app_client gets SELECT ONLY; app_staff has full CRUD. RLS
-- client_isolation is FOR ALL, but the SELECT-only grant keeps the client role out
-- of the write paths; the load-bearing NULLIF (SPIKE-001) handles pooled reuse
-- leaving the GUC as ''. uuid PK → no sequence to grant.
GRANT SELECT, INSERT, UPDATE, DELETE ON "gro_processes" TO app_staff;
GRANT SELECT ON "gro_processes" TO app_client;

ALTER TABLE "gro_processes" ENABLE ROW LEVEL SECURITY;

CREATE POLICY staff_full_access ON "gro_processes"
  FOR ALL TO app_staff USING (true) WITH CHECK (true);

CREATE POLICY client_isolation ON "gro_processes"
  FOR ALL TO app_client
  USING (client_id = NULLIF(current_setting('app.client_id', true), '')::uuid)
  WITH CHECK (client_id = NULLIF(current_setting('app.client_id', true), '')::uuid);
