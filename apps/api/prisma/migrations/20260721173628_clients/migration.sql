-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('active', 'inactive');

-- CreateTable
CREATE TABLE "cli_clients" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "status" "ClientStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cli_clients_pkey" PRIMARY KEY ("id")
);

-- CLIENT-01 grants + RLS (ADR-001, with a deliberate variation).
-- Staff manage all client companies; a client-rep may READ ONLY its own
-- company row and never write. UNLIKE core_scope_check, the scope key is the
-- row's OWN primary key (a client IS the client) — there is no client_id
-- column here. NULLIF is load-bearing (SPIKE-001): pooled reuse leaves the GUC
-- as '' (not NULL) and a bare ::uuid cast would throw.

GRANT SELECT, INSERT, UPDATE, DELETE ON "cli_clients" TO app_staff;
GRANT SELECT ON "cli_clients" TO app_client;

ALTER TABLE "cli_clients" ENABLE ROW LEVEL SECURITY;

-- Staff path: unrestricted (application policy service authorizes staff).
CREATE POLICY staff_full_access ON "cli_clients"
  FOR ALL TO app_staff
  USING (true) WITH CHECK (true);

-- Client-rep path: SELECT ONLY, and only the caller's own company row. No
-- write policy — app_client holds no INSERT/UPDATE/DELETE grant.
CREATE POLICY client_read ON "cli_clients"
  FOR SELECT TO app_client
  USING (id = NULLIF(current_setting('app.client_id', true), '')::uuid);
