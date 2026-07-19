-- ADR-001 production pattern (validated by SPIKE-001).
-- Roles are cluster-level: created idempotently. Dev passwords are defaults —
-- production MUST rotate via ALTER ROLE ... PASSWORD at provisioning (WS-20).

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_staff') THEN
    CREATE ROLE app_staff LOGIN PASSWORD 'app_staff_dev_pw';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_client') THEN
    CREATE ROLE app_client LOGIN PASSWORD 'app_client_dev_pw';
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO app_staff, app_client;

-- Grants are PER TABLE, added in each table's own migration (no blanket
-- ALL TABLES grants): a new client-scoped table gets access + policies in
-- one reviewable place. Template below; checklist in src/modules/README.md.

GRANT SELECT, INSERT, UPDATE, DELETE ON core_scope_check TO app_staff, app_client;
GRANT USAGE, SELECT ON SEQUENCE core_scope_check_id_seq TO app_staff, app_client;

ALTER TABLE core_scope_check ENABLE ROW LEVEL SECURITY;

-- Staff path: permissive policy; authorization for staff is enforced by the
-- application policy service (ADR-002). RLS is the client-rep backstop.
CREATE POLICY staff_full_access ON core_scope_check
  FOR ALL TO app_staff
  USING (true) WITH CHECK (true);

-- Client-rep path: fail closed. NULLIF is LOAD-BEARING (SPIKE-001 finding 1):
-- pooled-connection reuse leaves the GUC as '' (not NULL) after transaction-
-- local set_config, and a bare ::uuid cast would throw on unscoped queries.
CREATE POLICY client_isolation ON core_scope_check
  FOR ALL TO app_client
  USING (client_id = NULLIF(current_setting('app.client_id', true), '')::uuid)
  WITH CHECK (client_id = NULLIF(current_setting('app.client_id', true), '')::uuid);
