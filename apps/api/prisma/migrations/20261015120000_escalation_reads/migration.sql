-- NC-02 (ADR-021): READ MARKS for the escalation ladder. The ladder is derived
-- on every call and never stored; this is the one thing it keeps: per person,
-- the stage and the date at which they last marked an item read.

-- CreateTable
CREATE TABLE "esc_reads" (
    "user_id" UUID NOT NULL,
    "item_key" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "due_on" DATE NOT NULL,
    "read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "esc_reads_pkey" PRIMARY KEY ("user_id","item_key")
);

-- A mark names an item and one of the four stages.
ALTER TABLE "esc_reads"
  ADD CONSTRAINT "esc_reads_key_chk" CHECK (btrim("item_key") <> '' AND length("item_key") <= 200),
  ADD CONSTRAINT "esc_reads_stage_chk" CHECK ("stage" IN ('notice', 'reminder', 'escalation', 'breach'));

-- Staff connection only. DELETE is granted: marks for items that have left
-- the ladder are cleared, and a mark holds nothing worth keeping. The client
-- and employee connections get NO grants (their marks, from NC-05, are written
-- by the service after it has worked out what they are shown).
GRANT SELECT, INSERT, UPDATE, DELETE ON "esc_reads" TO app_staff;

ALTER TABLE "esc_reads" ENABLE ROW LEVEL SECURITY;

CREATE POLICY staff_full_access ON "esc_reads"
  FOR ALL TO app_staff USING (true) WITH CHECK (true);
