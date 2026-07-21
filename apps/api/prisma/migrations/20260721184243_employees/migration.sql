-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('male', 'female');

-- CreateEnum
CREATE TYPE "EmploymentStatus" AS ENUM ('active', 'on_leave', 'suspended', 'terminated');

-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('unlimited', 'fixed_term', 'part_time', 'temporary', 'seasonal');

-- CreateEnum
CREATE TYPE "GosiContributionBasis" AS ENUM ('basic', 'basic_plus_housing');

-- CreateEnum
CREATE TYPE "WpsStatus" AS ENUM ('compliant', 'pending', 'non_compliant');

-- CreateEnum
CREATE TYPE "ExitReentryStatus" AS ENUM ('none', 'single', 'multiple');

-- CreateEnum
CREATE TYPE "GosiRegistrationStatus" AS ENUM ('registered', 'pending', 'not_registered');

-- CreateTable
CREATE TABLE "emp_employees" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" UUID NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "nationality" TEXT NOT NULL,
    "gender" "Gender",
    "date_of_birth" DATE,
    "job_title_ar" TEXT,
    "job_title_en" TEXT,
    "department" TEXT,
    "hire_date" DATE,
    "employment_status" "EmploymentStatus" NOT NULL DEFAULT 'active',
    "contract_type" "ContractType" NOT NULL,
    "contract_end_date" DATE,
    "counts_toward_saudization" BOOLEAN,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "basic_salary" DECIMAL(12,2),
    "housing_allowance" DECIMAL(12,2),
    "transport_allowance" DECIMAL(12,2),
    "other_allowances" DECIMAL(12,2),
    "gosi_wage" DECIMAL(12,2),
    "gosi_contribution_basis" "GosiContributionBasis",
    "bank_iban" TEXT,
    "wps_status" "WpsStatus",
    "iqama_number" TEXT,
    "national_id" TEXT,
    "border_number" TEXT,
    "passport_number" TEXT,
    "work_permit_number" TEXT,
    "gosi_registration_number" TEXT,
    "absher_service_ref" TEXT,
    "iqama_expiry" DATE,
    "passport_expiry" DATE,
    "work_permit_expiry" DATE,
    "exit_reentry_status" "ExitReentryStatus",
    "exit_reentry_expiry" DATE,
    "gosi_registration_status" "GosiRegistrationStatus",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "emp_employees_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "emp_employees_client_id_idx" ON "emp_employees"("client_id");

-- EMP-01 grants + RLS (ADR-001 standard client-scoped pattern — keyed on the
-- client_id column, per the checklist in src/modules/README.md). Staff manage
-- all employees; a client-rep may READ ONLY its own client's employees and
-- never write (SELECT grant only). NULLIF is load-bearing (SPIKE-001).

GRANT SELECT, INSERT, UPDATE, DELETE ON "emp_employees" TO app_staff;
GRANT SELECT ON "emp_employees" TO app_client;

ALTER TABLE "emp_employees" ENABLE ROW LEVEL SECURITY;

CREATE POLICY staff_full_access ON "emp_employees"
  FOR ALL TO app_staff
  USING (true) WITH CHECK (true);

CREATE POLICY client_read ON "emp_employees"
  FOR SELECT TO app_client
  USING (client_id = NULLIF(current_setting('app.client_id', true), '')::uuid);
