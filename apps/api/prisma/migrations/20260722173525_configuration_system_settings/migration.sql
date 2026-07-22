-- CreateTable
CREATE TABLE "cfg_system_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cfg_system_settings_pkey" PRIMARY KEY ("key")
);

-- CONF-01 grants. System settings are DEPLOYMENT-WIDE, not client-owned, so
-- this table has NO RLS (like auth_users). Both runtime roles may READ effective
-- settings; only the staff path WRITES (config.write is System Admin, a staff
-- role, and the write goes through the app_staff connection). No DELETE is
-- granted to any runtime role — settings are upserted, never row-deleted; the
-- owner role (migrations) keeps full rights.
GRANT SELECT ON "cfg_system_settings" TO app_staff, app_client;
GRANT INSERT, UPDATE ON "cfg_system_settings" TO app_staff;
