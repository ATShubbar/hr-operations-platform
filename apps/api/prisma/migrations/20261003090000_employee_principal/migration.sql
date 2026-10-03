-- SS-01 (ADR-011): employees become a third kind of principal.
--
-- The enum values ship in their OWN migration: Postgres refuses to use an enum
-- value in the same transaction that added it ("unsafe use of new value"), and
-- the CHECK constraints in the next migration reference 'employee'.

-- AlterEnum
ALTER TYPE "PrincipalType" ADD VALUE 'employee';

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'employee';

-- AlterTable
-- A bare reference to emp_employees.id, deliberately without a foreign key:
-- that table belongs to the Employees module (cross-module rule).
ALTER TABLE "auth_users" ADD COLUMN     "employee_id" UUID;

-- CreateIndex
-- One employee record, at most one account.
CREATE UNIQUE INDEX "auth_users_employee_id_key" ON "auth_users"("employee_id");
