-- CreateTable
CREATE TABLE "notif_preferences" (
    "user_id" UUID NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "email_enabled" BOOLEAN NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notif_preferences_pkey" PRIMARY KEY ("user_id","category")
);

-- NOTIF-04 grants. Per-user notification preferences are user-OWNED, not
-- client-owned, so — like cfg_user_settings / notif_notifications — this table
-- has NO RLS: isolation is application-enforced (every query filters by the
-- caller's context actorId, never input). The staff connection owns all access;
-- a client-rep's own-pref operations run through app_staff via the Notifications
-- service, so app_client gets nothing.
GRANT SELECT, INSERT, UPDATE, DELETE ON "notif_preferences" TO app_staff;
