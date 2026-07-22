-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM ('document_expiry', 'task', 'request', 'general', 'system');

-- CreateTable
CREATE TABLE "notif_notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "recipient_user_id" UUID NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "title_ar" TEXT NOT NULL,
    "title_en" TEXT NOT NULL,
    "body_ar" TEXT NOT NULL,
    "body_en" TEXT NOT NULL,
    "data" JSONB,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notif_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notif_notifications_recipient_user_id_read_at_idx" ON "notif_notifications"("recipient_user_id", "read_at");

-- CreateIndex
CREATE INDEX "notif_notifications_created_at_idx" ON "notif_notifications"("created_at");

-- NOTIF-02 grants. Recipient-OWNED, not client-owned → NO RLS (like auth_users):
-- isolation is application-enforced (every query filters by the caller's context
-- actorId). The staff connection owns all access; the row is scoped by actor, so
-- app_client gets nothing (a client-rep's own-notification reads still run
-- through app_staff via the Notifications service).
GRANT SELECT, INSERT, UPDATE, DELETE ON "notif_notifications" TO app_staff;
