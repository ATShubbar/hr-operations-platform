-- CreateEnum
CREATE TYPE "GroSequenceKind" AS ENUM ('onboarding', 'final_exit');

-- CreateEnum
CREATE TYPE "GroSequenceStatus" AS ENUM ('running', 'completed', 'cancelled');

-- CreateTable
CREATE TABLE "gro_sequences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "kind" "GroSequenceKind" NOT NULL,
    "status" "GroSequenceStatus" NOT NULL DEFAULT 'running',
    "started_on" DATE NOT NULL,
    "started_by_user_id" UUID,
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gro_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gro_sequence_steps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sequence_id" UUID NOT NULL,
    "step_key" TEXT NOT NULL,
    "filed_on" DATE,
    "filed_by_user_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gro_sequence_steps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gro_sequences_employee_id_idx" ON "gro_sequences"("employee_id");

-- CreateIndex
CREATE INDEX "gro_sequences_status_idx" ON "gro_sequences"("status");

-- CreateIndex
CREATE UNIQUE INDEX "gro_sequence_steps_sequence_id_step_key_key" ON "gro_sequence_steps"("sequence_id", "step_key");

-- AddForeignKey
ALTER TABLE "gro_sequence_steps" ADD CONSTRAINT "gro_sequence_steps_sequence_id_fkey" FOREIGN KEY ("sequence_id") REFERENCES "gro_sequences"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- MOB-01 (ADR-018). At most ONE running sequence per employee per kind — the
-- rule a double click or a race would otherwise break. Finished runs (completed,
-- cancelled) don't count, so a person can be onboarded again later.
CREATE UNIQUE INDEX "gro_sequences_one_running_idx"
  ON "gro_sequences" ("employee_id", "kind") WHERE "status" = 'running';

-- Facts the application must never be able to break.
ALTER TABLE "gro_sequences"
  ADD CONSTRAINT "gro_sequences_completed_chk" CHECK (("status" = 'completed') = ("completed_at" IS NOT NULL)),
  ADD CONSTRAINT "gro_sequences_cancelled_chk" CHECK (("status" = 'cancelled') = ("cancelled_at" IS NOT NULL));
ALTER TABLE "gro_sequence_steps"
  ADD CONSTRAINT "gro_sequence_steps_filed_chk" CHECK (("filed_on" IS NULL) = ("filed_by_user_id" IS NULL));

-- STAFF-OWNED (owner decision: client managers and employees see nothing), like
-- task_tasks: app_client and app_employee get NO grants. Staff may not DELETE —
-- a run ends completed or cancelled, and a reopened step keeps its row.
GRANT SELECT, INSERT, UPDATE ON "gro_sequences", "gro_sequence_steps" TO app_staff;

ALTER TABLE "gro_sequences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gro_sequence_steps" ENABLE ROW LEVEL SECURITY;

CREATE POLICY staff_full_access ON "gro_sequences"
  FOR ALL TO app_staff USING (true) WITH CHECK (true);
CREATE POLICY staff_full_access ON "gro_sequence_steps"
  FOR ALL TO app_staff USING (true) WITH CHECK (true);
