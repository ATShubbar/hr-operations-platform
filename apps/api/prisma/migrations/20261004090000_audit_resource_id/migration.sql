-- AUDIT-06: an audit entry records WHICH record it is about, so one record's
-- history can be read (the Person record's History tab). Nullable: entries
-- written before this change have no record id, and none is guessed for them
-- (the before/after snapshots are not a reliable key). The table stays
-- append-only; this only adds a column and an index.
ALTER TABLE "aud_entries" ADD COLUMN "resource_id" UUID;
CREATE INDEX "aud_entries_resource_resource_id_idx" ON "aud_entries"("resource", "resource_id");
