-- CreateTable
CREATE TABLE "cfg_user_settings" (
    "user_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cfg_user_settings_pkey" PRIMARY KEY ("user_id","key")
);

-- CONF-03 grants. Per-user preferences are user-OWNED, not client-owned, so —
-- like auth_users — this table has NO RLS: isolation is application-enforced
-- (every query filters by the caller's context actorId). The staff connection
-- owns all access; the row is scoped by actor, not client, so app_client gets
-- nothing (a client-rep's own-pref operations still run through app_staff via
-- the Configuration service). No DELETE-guard needed — prefs are cleared by the
-- owner; the owner role keeps full rights for migrations.
GRANT SELECT, INSERT, UPDATE, DELETE ON "cfg_user_settings" TO app_staff;
