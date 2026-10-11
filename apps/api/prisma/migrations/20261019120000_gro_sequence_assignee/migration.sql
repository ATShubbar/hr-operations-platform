-- MOB-06a (ADR-018 rev. 2): one owner per running onboarding / final exit. Its
-- ready steps are that officer's work items (queue, calendar, the bell).
-- Existing runs start with nobody; an officer picks them up from the queue.
-- No grant change: gro_sequences is staff-owned per table.
ALTER TABLE "gro_sequences" ADD COLUMN "assignee_user_id" UUID;
CREATE INDEX "gro_sequences_assignee_user_id_idx" ON "gro_sequences"("assignee_user_id");
