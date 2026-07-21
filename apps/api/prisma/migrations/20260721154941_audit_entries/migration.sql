-- CreateTable
CREATE TABLE "aud_entries" (
    "id" BIGSERIAL NOT NULL,
    "actor_id" UUID,
    "actor_role" TEXT,
    "client_id" UUID,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "request_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aud_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "aud_entries_resource_action_idx" ON "aud_entries"("resource", "action");

-- CreateIndex
CREATE INDEX "aud_entries_client_id_idx" ON "aud_entries"("client_id");

-- CreateIndex
CREATE INDEX "aud_entries_created_at_idx" ON "aud_entries"("created_at");

-- AUDIT-01 append-only grants (architecture.md Shared Modules).
-- Only app_staff, and only SELECT + INSERT. NO UPDATE and NO DELETE are
-- granted to ANY application role, so append-only is enforced by the grant
-- itself, not by convention: a runtime UPDATE/DELETE fails with "permission
-- denied". The owner role (DATABASE_URL, migrations only) keeps full rights.
-- app_client gets NOTHING here — no client role has audit.read; the
-- client-rep write path (app_client INSERT + its RLS WITH CHECK) lands in
-- AUDIT-02 when client-rep mutations are wired and testable.
GRANT SELECT, INSERT ON "aud_entries" TO app_staff;
GRANT USAGE ON SEQUENCE "aud_entries_id_seq" TO app_staff;
