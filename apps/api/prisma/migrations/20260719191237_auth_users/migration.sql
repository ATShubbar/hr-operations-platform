-- CreateEnum
CREATE TYPE "PrincipalType" AS ENUM ('staff', 'client_rep');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'disabled');

-- CreateTable
CREATE TABLE "auth_users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "principal_type" "PrincipalType" NOT NULL,
    "client_id" UUID,
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "mfa_secret" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auth_users_email_key" ON "auth_users"("email");

-- auth_users is a SYSTEM table (ADR-002 / AUTH-01): staff users have no
-- client and authentication precedes any client scope. Grants are
-- app_staff-only — the app_client role must NEVER read identity data.
-- This table is deliberately NOT under the client-scoped RLS checklist.
GRANT SELECT, INSERT, UPDATE, DELETE ON auth_users TO app_staff;
