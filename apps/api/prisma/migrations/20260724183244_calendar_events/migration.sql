-- CreateTable
CREATE TABLE "cal_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_user_id" UUID NOT NULL,
    "client_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3) NOT NULL,
    "all_day" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cal_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cal_events_owner_user_id_idx" ON "cal_events"("owner_user_id");

-- CreateIndex
CREATE INDEX "cal_events_start_at_idx" ON "cal_events"("start_at");

-- CreateIndex
CREATE INDEX "cal_events_client_id_idx" ON "cal_events"("client_id");

-- CAL-01 grants + RLS. Calendar is consultancy-INTERNAL (matrix — clients have no
-- calendar access), so like task_tasks app_client is granted NOTHING and there is
-- no client policy; app_staff has full access under staff_full_access (defence-in-
-- depth). owner_user_id is the own-scope key; client_id is optional context, not a
-- client-rep scope key.
GRANT SELECT, INSERT, UPDATE, DELETE ON "cal_events" TO app_staff;

ALTER TABLE "cal_events" ENABLE ROW LEVEL SECURITY;

CREATE POLICY staff_full_access ON "cal_events"
  FOR ALL TO app_staff USING (true) WITH CHECK (true);
