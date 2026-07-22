-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('iqama', 'passport', 'visa', 'contract', 'gosi', 'national_id', 'cv', 'other');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('pending', 'available', 'quarantined', 'deleted');

-- CreateTable
CREATE TABLE "doc_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" UUID NOT NULL,
    "category" "DocumentCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER,
    "storage_key" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'pending',
    "issue_date" DATE,
    "expiry_date" DATE,
    "employee_id" UUID,
    "uploaded_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doc_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "doc_documents_client_id_idx" ON "doc_documents"("client_id");

-- CreateIndex
CREATE INDEX "doc_documents_expiry_date_idx" ON "doc_documents"("expiry_date");

-- CreateIndex
CREATE INDEX "doc_documents_employee_id_idx" ON "doc_documents"("employee_id");

-- DOC-01 grants + RLS (ADR-001 standard client-scoped pattern — keyed on the
-- client_id column, per the checklist in src/modules/README.md). Staff manage
-- all documents; a client-rep may READ ONLY its own client's documents. The
-- client-rep CREATE-own path (permission matrix: client_admin "CR own") lands
-- with its endpoint (portal / a later DOC card) — SELECT-only for now, so the
-- default is deny. NULLIF is load-bearing (SPIKE-001). No sequence (uuid PK).
GRANT SELECT, INSERT, UPDATE, DELETE ON "doc_documents" TO app_staff;
GRANT SELECT ON "doc_documents" TO app_client;

ALTER TABLE "doc_documents" ENABLE ROW LEVEL SECURITY;

CREATE POLICY staff_full_access ON "doc_documents"
  FOR ALL TO app_staff
  USING (true) WITH CHECK (true);

CREATE POLICY client_read ON "doc_documents"
  FOR SELECT TO app_client
  USING (client_id = NULLIF(current_setting('app.client_id', true), '')::uuid);
