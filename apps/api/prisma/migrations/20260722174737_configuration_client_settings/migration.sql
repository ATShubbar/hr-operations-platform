-- CreateTable
CREATE TABLE "cfg_client_settings" (
    "client_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cfg_client_settings_pkey" PRIMARY KEY ("client_id","key")
);

-- CONF-02 client-scoped table checklist (apps/api/src/modules/README.md).
-- client_id is denormalized (part of the PK). No sequence grant — the PK is
-- composite text, not a BIGSERIAL. RLS policies use the load-bearing NULLIF
-- (SPIKE-001): pooled reuse leaves the GUC as '' and a bare ::uuid cast throws.
GRANT SELECT, INSERT, UPDATE, DELETE ON "cfg_client_settings" TO app_staff, app_client;

ALTER TABLE "cfg_client_settings" ENABLE ROW LEVEL SECURITY;

CREATE POLICY staff_full_access ON "cfg_client_settings"
  FOR ALL TO app_staff USING (true) WITH CHECK (true);

CREATE POLICY client_isolation ON "cfg_client_settings"
  FOR ALL TO app_client
  USING (client_id = NULLIF(current_setting('app.client_id', true), '')::uuid)
  WITH CHECK (client_id = NULLIF(current_setting('app.client_id', true), '')::uuid);
