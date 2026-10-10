-- BILL-01 (ADR-020): the ledger of government fees paid on clients' behalf.

-- The human reference (GF-0001…). Created before the table whose default uses it.
CREATE SEQUENCE "bil_fees_ref_seq";


-- CreateEnum
CREATE TYPE "FeeSourceKind" AS ENUM ('manual', 'sequence_step', 'procedure');

-- CreateEnum
CREATE TYPE "FeeStatus" AS ENUM ('recorded', 'invoiced', 'void');

-- CreateTable
CREATE TABLE "bil_fees" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ref" TEXT NOT NULL DEFAULT ('GF-'::text || lpad((nextval('bil_fees_ref_seq'::regclass))::text, 4, '0'::text)),
    "client_id" UUID NOT NULL,
    "employee_id" UUID,
    "source_kind" "FeeSourceKind" NOT NULL,
    "sequence_id" UUID,
    "sequence_kind" TEXT,
    "step_key" TEXT,
    "process_id" UUID,
    "procedure_type" TEXT,
    "label" TEXT,
    "authority" TEXT NOT NULL,
    "amount_halalas" INTEGER NOT NULL,
    "paid_on" DATE NOT NULL,
    "status" "FeeStatus" NOT NULL DEFAULT 'recorded',
    "recorded_by_user_id" UUID,
    "voided_at" TIMESTAMP(3),
    "voided_by_user_id" UUID,
    "void_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bil_fees_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bil_fees_ref_key" ON "bil_fees"("ref");

-- CreateIndex
CREATE INDEX "bil_fees_client_id_paid_on_idx" ON "bil_fees"("client_id", "paid_on");

-- CreateIndex
CREATE INDEX "bil_fees_employee_id_idx" ON "bil_fees"("employee_id");

-- CreateIndex
CREATE INDEX "bil_fees_status_idx" ON "bil_fees"("status");


ALTER SEQUENCE "bil_fees_ref_seq" OWNED BY "bil_fees"."ref";

-- A fee tied to a sequence step or to a procedure is recorded ONCE. A void fee
-- does not count, so a fee voided in error can be recorded again.
CREATE UNIQUE INDEX "bil_fees_one_per_step_idx"
  ON "bil_fees" ("sequence_id", "step_key") WHERE "source_kind" = 'sequence_step' AND "status" <> 'void';
CREATE UNIQUE INDEX "bil_fees_one_per_process_idx"
  ON "bil_fees" ("process_id") WHERE "source_kind" = 'procedure' AND "status" <> 'void';

-- Facts the application must never be able to break:
--   money is a positive whole number of halalas;
--   a fee says what it was for, in the shape its kind requires;
--   void means who, when and why — and nothing else carries those stamps.
ALTER TABLE "bil_fees"
  ADD CONSTRAINT "bil_fees_amount_chk" CHECK ("amount_halalas" > 0),
  ADD CONSTRAINT "bil_fees_source_chk" CHECK (
    ("source_kind" = 'manual'
       AND "label" IS NOT NULL AND btrim("label") <> ''
       AND "sequence_id" IS NULL AND "step_key" IS NULL AND "process_id" IS NULL)
    OR ("source_kind" = 'sequence_step'
       AND "sequence_id" IS NOT NULL AND "step_key" IS NOT NULL AND "sequence_kind" IS NOT NULL
       AND "employee_id" IS NOT NULL AND "process_id" IS NULL)
    OR ("source_kind" = 'procedure'
       AND "process_id" IS NOT NULL AND "procedure_type" IS NOT NULL
       AND "employee_id" IS NOT NULL AND "sequence_id" IS NULL AND "step_key" IS NULL)
  ),
  ADD CONSTRAINT "bil_fees_void_chk" CHECK (
    ("status" = 'void') = ("voided_at" IS NOT NULL)
    AND ("status" = 'void') = ("void_reason" IS NOT NULL)
  );

-- STAFF-OWNED (owner decision, ADR-020: client managers and employees see
-- nothing of the money yet): app_client and app_employee get NO grants.
-- Staff may not DELETE — a fee is voided, never removed.
GRANT SELECT, INSERT, UPDATE ON "bil_fees" TO app_staff;
GRANT USAGE, SELECT ON SEQUENCE "bil_fees_ref_seq" TO app_staff;

ALTER TABLE "bil_fees" ENABLE ROW LEVEL SECURITY;

CREATE POLICY staff_full_access ON "bil_fees"
  FOR ALL TO app_staff USING (true) WITH CHECK (true);
