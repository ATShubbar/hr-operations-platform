-- SPIKE-001: two DB roles + fail-closed RLS policies (ADR-001 pattern A).

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'spike_staff') THEN
    CREATE ROLE spike_staff LOGIN PASSWORD 'spike_staff_pw';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'spike_client') THEN
    CREATE ROLE spike_client LOGIN PASSWORD 'spike_client_pw';
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO spike_staff, spike_client;
GRANT SELECT, INSERT, UPDATE, DELETE ON sp_employees TO spike_staff, spike_client;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO spike_staff, spike_client;

ALTER TABLE sp_employees ENABLE ROW LEVEL SECURITY;

-- Staff: full access via explicit permissive policy (authorization is the
-- app policy service's job for staff; RLS is the client-rep backstop).
CREATE POLICY staff_full_access ON sp_employees
  FOR ALL TO spike_staff
  USING (true) WITH CHECK (true);

-- Client reps: fail closed. current_setting(..., true) returns NULL when the
-- scope is unset -> predicate is not true -> zero rows, never an open door.
CREATE POLICY client_isolation ON sp_employees
  FOR ALL TO spike_client
  USING (client_id = current_setting('app.client_id', true)::uuid)
  WITH CHECK (client_id = current_setting('app.client_id', true)::uuid);
