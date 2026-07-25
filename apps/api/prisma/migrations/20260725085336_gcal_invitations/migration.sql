-- CreateEnum
CREATE TYPE "GcalInvitationKind" AS ENUM ('interview', 'meeting');

-- CreateEnum
CREATE TYPE "GcalInvitationStatus" AS ENUM ('scheduled', 'cancelled');

-- CreateTable
CREATE TABLE "int_gcal_invitations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "external_event_id" TEXT NOT NULL,
    "reference_code" TEXT NOT NULL,
    "kind" "GcalInvitationKind" NOT NULL,
    "status" "GcalInvitationStatus" NOT NULL DEFAULT 'scheduled',
    "client_id" UUID,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "int_gcal_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "int_gcal_invitations_external_event_id_idx" ON "int_gcal_invitations"("external_event_id");

-- CreateIndex
CREATE INDEX "int_gcal_invitations_created_by_user_id_idx" ON "int_gcal_invitations"("created_by_user_id");

-- GCAL-02 grants + RLS. Integration invitations are consultancy-INTERNAL (clients
-- have no access), so like task_tasks app_client is granted NOTHING and there is no
-- client policy; app_staff has full access under staff_full_access (defence-in-depth).
GRANT SELECT, INSERT, UPDATE, DELETE ON "int_gcal_invitations" TO app_staff;

ALTER TABLE "int_gcal_invitations" ENABLE ROW LEVEL SECURITY;

CREATE POLICY staff_full_access ON "int_gcal_invitations"
  FOR ALL TO app_staff USING (true) WITH CHECK (true);
