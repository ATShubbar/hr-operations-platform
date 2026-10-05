-- CreateEnum
CREATE TYPE "DependantRelationship" AS ENUM ('spouse', 'son', 'daughter');

-- CreateTable
CREATE TABLE "emp_dependants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "relationship" "DependantRelationship" NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_ar" TEXT,
    "date_of_birth" DATE,
    "iqama_number" TEXT,
    "iqama_expiry" DATE,
    "passport_expiry" DATE,
    "insurance_expiry" DATE,
    "removed_at" TIMESTAMP(3),
    "removed_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "emp_dependants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "emp_dependants_employee_id_idx" ON "emp_dependants"("employee_id");


-- DEP-01 (ADR-017). Facts the application must never be able to break:
-- a name, and removal recorded together with who removed it.
ALTER TABLE "emp_dependants"
  ADD CONSTRAINT "emp_dependants_name_chk" CHECK (btrim("name_en") <> ''),
  ADD CONSTRAINT "emp_dependants_removed_chk" CHECK (("removed_at" IS NULL) = ("removed_by_user_id" IS NULL));

-- Grants. Staff read and write but may NOT delete: removal is soft, because the
-- audit trail and the Person record's History refer to the row. Client managers
-- get NOTHING (family details are not the employer's business — ADR-017), so
-- there is no client policy. Employees read their own rows only (the
-- employee-readable checklist, SPIKE-001 NULLIF form).
GRANT SELECT, INSERT, UPDATE ON "emp_dependants" TO app_staff;
GRANT SELECT ON "emp_dependants" TO app_employee;

ALTER TABLE "emp_dependants" ENABLE ROW LEVEL SECURITY;

CREATE POLICY staff_full_access ON "emp_dependants"
  FOR ALL TO app_staff USING (true) WITH CHECK (true);

CREATE POLICY employee_self ON "emp_dependants"
  FOR SELECT TO app_employee
  USING (employee_id = NULLIF(current_setting('app.employee_id', true), '')::uuid);
