-- CreateEnum
CREATE TYPE "RequestType" AS ENUM ('letter', 'certificate', 'document', 'gro_service', 'general');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('open', 'in_progress', 'resolved', 'closed', 'cancelled');

-- CreateEnum
CREATE TYPE "RequestPriority" AS ENUM ('low', 'normal', 'high');

-- CreateTable
CREATE TABLE "req_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" UUID NOT NULL,
    "type" "RequestType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "RequestStatus" NOT NULL DEFAULT 'open',
    "priority" "RequestPriority" NOT NULL DEFAULT 'normal',
    "due_date" DATE,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "req_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "req_requests_client_id_idx" ON "req_requests"("client_id");

-- CreateIndex
CREATE INDEX "req_requests_status_idx" ON "req_requests"("status");

-- CreateIndex
CREATE INDEX "req_requests_due_date_idx" ON "req_requests"("due_date");

-- REQ-01 client-scoped table checklist (apps/api/src/modules/README.md). The
-- FIRST table clients WRITE: app_client is granted SELECT/INSERT/UPDATE (matrix
-- Client Admin CRU own / Client User CR own) but NOT DELETE (only staff archive).
-- RLS client_isolation is FOR ALL so the WITH CHECK bars cross-client writes;
-- the load-bearing NULLIF (SPIKE-001) handles pooled reuse leaving the GUC as ''.
-- uuid PK → no sequence to grant.
GRANT SELECT, INSERT, UPDATE, DELETE ON "req_requests" TO app_staff;
GRANT SELECT, INSERT, UPDATE ON "req_requests" TO app_client;

ALTER TABLE "req_requests" ENABLE ROW LEVEL SECURITY;

CREATE POLICY staff_full_access ON "req_requests"
  FOR ALL TO app_staff USING (true) WITH CHECK (true);

CREATE POLICY client_isolation ON "req_requests"
  FOR ALL TO app_client
  USING (client_id = NULLIF(current_setting('app.client_id', true), '')::uuid)
  WITH CHECK (client_id = NULLIF(current_setting('app.client_id', true), '')::uuid);
