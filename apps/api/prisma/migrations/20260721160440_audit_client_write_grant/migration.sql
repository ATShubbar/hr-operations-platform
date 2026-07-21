-- AUDIT-02: extend the audit write path to the client-representative role.
-- app_client may now INSERT audit rows, but ONLY for its own client, and it
-- still cannot read, update, or delete them (no SELECT/UPDATE/DELETE grant).
--
-- Enabling RLS makes app_staff (a non-owner role) policy-subject, so a
-- permissive staff policy is REQUIRED to preserve AUDIT-01's staff read/write.
-- The owner role (DATABASE_URL, migrations only) bypasses RLS.

GRANT INSERT ON "aud_entries" TO app_client;

ALTER TABLE "aud_entries" ENABLE ROW LEVEL SECURITY;

-- Staff path: unrestricted. Staff authorization is the application policy
-- service (ADR-002); RLS is the client-rep backstop. Mirrors core_scope_check.
CREATE POLICY staff_full_access ON "aud_entries"
  FOR ALL TO app_staff
  USING (true) WITH CHECK (true);

-- Client-rep path: INSERT ONLY, and only for the caller's own client. No
-- USING clause — app_client holds no SELECT/UPDATE/DELETE grant, so there is
-- nothing to read or modify; the WITH CHECK fails closed on write. NULLIF is
-- load-bearing (SPIKE-001): pooled reuse leaves the GUC as '' (not NULL) and a
-- bare ::uuid cast would throw.
CREATE POLICY client_insert ON "aud_entries"
  FOR INSERT TO app_client
  WITH CHECK (client_id = NULLIF(current_setting('app.client_id', true), '')::uuid);
