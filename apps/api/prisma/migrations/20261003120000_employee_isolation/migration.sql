-- SS-02 (ADR-011): the database backstop for employee self-service.
--
-- An employee session sees exactly ONE employee's data — its own. This is the
-- narrowest boundary in the system, narrower than a client company, so it gets
-- its own login role rather than riding on app_client:
--
--   * Postgres applies a policy `TO app_employee` to every role that is a
--     MEMBER of app_employee. Granting app_employee to app_client (to switch
--     role inside a transaction) would make these policies apply to client-rep
--     queries too. A separate login role has no such interaction.
--   * It mirrors ADR-001 exactly: one connection string per trust level.
--
-- Dev password is a default — production MUST rotate it at provisioning, with
-- app_staff / app_client (docs/PROVISIONING-*.md).

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_employee') THEN
    CREATE ROLE app_employee LOGIN PASSWORD 'app_employee_dev_pw';
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO app_employee;

-- READ-ONLY, and only these two tables. No INSERT/UPDATE/DELETE anywhere: an
-- employee changes nothing directly (ADR-011 — changes are requested and made
-- by staff). Every other table is "permission denied" for this role, which is
-- the first fence; the policies below are the second. Requests get their own
-- employee policy in SS-05, where employee-raised requests are designed.
GRANT SELECT ON "emp_employees" TO app_employee;
GRANT SELECT ON "doc_documents" TO app_employee;

-- Both tables already have RLS enabled (their own migrations). NULLIF is
-- load-bearing (SPIKE-001): pooled reuse leaves the GUC as '' — the bare cast
-- would throw, and NULL never equals anything, so an unscoped session sees
-- zero rows rather than an error or everything.

-- The employee's own record: the row whose id IS the session's employee.
CREATE POLICY employee_self ON "emp_employees"
  FOR SELECT TO app_employee
  USING (id = NULLIF(current_setting('app.employee_id', true), '')::uuid);

-- The employee's own documents. Status (available-only) is an application rule
-- (PORTAL-03 pattern), deliberately NOT encoded here: RLS answers "whose", the
-- service answers "which of theirs".
CREATE POLICY employee_self ON "doc_documents"
  FOR SELECT TO app_employee
  USING (employee_id = NULLIF(current_setting('app.employee_id', true), '')::uuid);
