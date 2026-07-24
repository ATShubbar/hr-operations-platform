-- CreateEnum
CREATE TYPE "VacancyStatus" AS ENUM ('draft', 'open', 'filled', 'closed', 'cancelled');

-- CreateTable
CREATE TABLE "rec_vacancies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" UUID NOT NULL,
    "title_ar" TEXT NOT NULL,
    "title_en" TEXT NOT NULL,
    "description" TEXT,
    "department" TEXT,
    "headcount" INTEGER NOT NULL DEFAULT 1,
    "status" "VacancyStatus" NOT NULL DEFAULT 'draft',
    "opened_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rec_vacancies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rec_vacancies_client_id_idx" ON "rec_vacancies"("client_id");

-- CreateIndex
CREATE INDEX "rec_vacancies_status_idx" ON "rec_vacancies"("status");

-- REC-01 client-scoped table checklist (apps/api/src/modules/README.md). Unlike
-- req_requests, clients only READ their OWN vacancies (permission matrix: Client
-- Admin/User = "R own vacancies") — so app_client gets SELECT ONLY (never write).
-- app_staff has full CRUD. RLS client_isolation is FOR ALL, but with the SELECT-
-- only grant the client role can never reach the write paths; the load-bearing
-- NULLIF (SPIKE-001) handles pooled reuse leaving the GUC as ''. uuid PK → no
-- sequence to grant.
GRANT SELECT, INSERT, UPDATE, DELETE ON "rec_vacancies" TO app_staff;
GRANT SELECT ON "rec_vacancies" TO app_client;

ALTER TABLE "rec_vacancies" ENABLE ROW LEVEL SECURITY;

CREATE POLICY staff_full_access ON "rec_vacancies"
  FOR ALL TO app_staff USING (true) WITH CHECK (true);

CREATE POLICY client_isolation ON "rec_vacancies"
  FOR ALL TO app_client
  USING (client_id = NULLIF(current_setting('app.client_id', true), '')::uuid)
  WITH CHECK (client_id = NULLIF(current_setting('app.client_id', true), '')::uuid);
