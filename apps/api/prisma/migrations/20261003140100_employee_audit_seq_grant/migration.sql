-- SS-05: the employee audit INSERT also needs the id sequence. Without USAGE,
-- Postgres refuses at nextval ("permission denied for sequence
-- aud_entries_id_seq") BEFORE the RLS WITH CHECK is evaluated — the same
-- finding AUDIT-02 made for app_client (20260721160826_audit_client_seq_grant).
-- Caught by SS-05's first e2e run: every employee-raised request returned 500.
GRANT USAGE ON SEQUENCE "aud_entries_id_seq" TO app_employee;
