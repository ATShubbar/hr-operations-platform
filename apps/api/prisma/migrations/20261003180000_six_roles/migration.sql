-- ROLE-03 (ADR-013, architecture.md v1.7): ten roles become six.
--
--   system_admin, company_admin      -> administrator
--   hr_officer, recruiter, finance   -> hr_officer
--   gro_officer                      -> gro_officer
--   read_only                        -> auditor
--   client_admin, client_user        -> client_manager
--   employee                         -> employee
--
-- Postgres cannot drop enum values, so the type is rebuilt. The role CHECK is
-- dropped first (its literal is bound to the old type) and replaced by a
-- STRICTER one: every principal type now has exactly the roles it may hold, so
-- a staff account with a client role (or the reverse) cannot exist.

ALTER TABLE "auth_users" DROP CONSTRAINT "auth_users_employee_role_chk";
ALTER TABLE "auth_users" ALTER COLUMN "role" DROP DEFAULT;

CREATE TYPE "Role_new" AS ENUM ('administrator', 'hr_officer', 'gro_officer', 'auditor', 'client_manager', 'employee');

ALTER TABLE "auth_users" ALTER COLUMN "role" TYPE "Role_new" USING (
  CASE "role"::text
    WHEN 'system_admin'  THEN 'administrator'
    WHEN 'company_admin' THEN 'administrator'
    WHEN 'recruiter'     THEN 'hr_officer'
    WHEN 'finance'       THEN 'hr_officer'
    WHEN 'read_only'     THEN 'auditor'
    WHEN 'client_admin'  THEN 'client_manager'
    WHEN 'client_user'   THEN 'client_manager'
    ELSE "role"::text
  END
)::"Role_new";

DROP TYPE "Role";
ALTER TYPE "Role_new" RENAME TO "Role";

-- No DEFAULT is restored on purpose (ADR-013): the old default, read_only, would
-- now be Auditor — pay visibility for any account created without a role.

ALTER TABLE "auth_users" ADD CONSTRAINT "auth_users_role_principal_chk" CHECK (
     ("principal_type" = 'staff'      AND "role" IN ('administrator', 'hr_officer', 'gro_officer', 'auditor'))
  OR ("principal_type" = 'client_rep' AND "role" = 'client_manager')
  OR ("principal_type" = 'employee'   AND "role" = 'employee')
);
