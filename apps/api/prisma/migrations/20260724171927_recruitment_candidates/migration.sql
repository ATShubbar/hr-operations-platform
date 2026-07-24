-- CreateEnum
CREATE TYPE "CandidateStage" AS ENUM ('applied', 'screening', 'interview', 'offer', 'hired', 'rejected', 'withdrawn');

-- CreateTable
CREATE TABLE "rec_candidates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" UUID NOT NULL,
    "vacancy_id" UUID NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "stage" "CandidateStage" NOT NULL DEFAULT 'applied',
    "cv_document_id" UUID,
    "notes" TEXT,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rec_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rec_candidates_vacancy_id_idx" ON "rec_candidates"("vacancy_id");

-- CreateIndex
CREATE INDEX "rec_candidates_client_id_idx" ON "rec_candidates"("client_id");

-- CreateIndex
CREATE INDEX "rec_candidates_stage_idx" ON "rec_candidates"("stage");

-- REC-03 grants + RLS. Candidates are consultancy-INTERNAL (their PII/CVs are the
-- consultancy's recruitment data; clients never see applicants) — so, like
-- task_tasks, app_client is granted NOTHING and there is no client policy;
-- app_staff has full access under staff_full_access (defence-in-depth). client_id
-- is a denormalized reporting/audit-scope link, not a client-rep scope key.
GRANT SELECT, INSERT, UPDATE, DELETE ON "rec_candidates" TO app_staff;

ALTER TABLE "rec_candidates" ENABLE ROW LEVEL SECURITY;

CREATE POLICY staff_full_access ON "rec_candidates"
  FOR ALL TO app_staff USING (true) WITH CHECK (true);
