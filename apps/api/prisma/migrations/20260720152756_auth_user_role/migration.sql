-- CreateEnum
CREATE TYPE "Role" AS ENUM ('system_admin', 'company_admin', 'recruiter', 'hr_officer', 'gro_officer', 'finance', 'read_only', 'client_admin', 'client_user');

-- AlterTable
ALTER TABLE "auth_users" ADD COLUMN     "role" "Role" NOT NULL DEFAULT 'read_only';
