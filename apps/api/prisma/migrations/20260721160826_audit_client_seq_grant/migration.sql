-- AUDIT-02 (follow-up to _audit_client_write_grant): the BIGSERIAL default on
-- aud_entries calls nextval(), which requires USAGE on the sequence. Without
-- it an app_client INSERT fails with "permission denied for sequence
-- aud_entries_id_seq" BEFORE the RLS WITH CHECK is ever evaluated. AUDIT-01
-- granted this sequence to app_staff only; extend it to app_client so the
-- client-rep write path can obtain an id. (Kept as its own migration because
-- the prior one was already applied — applied migrations are never edited.)
GRANT USAGE ON SEQUENCE "aud_entries_id_seq" TO app_client;
