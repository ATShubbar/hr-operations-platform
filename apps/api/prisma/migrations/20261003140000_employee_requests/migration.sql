-- SS-05 (ADR-011): employees raise and track their OWN requests — the first
-- thing an employee writes. The rules live in the database, not only in code:
-- a bug or a forged body cannot file a request for another employee, another
-- company, or with staff-only fields set.

-- AlterTable
-- Who raised it, when an employee did. A bare reference (emp_employees belongs
-- to Employees); NULL for staff- and client-rep-raised requests.
ALTER TABLE "req_requests" ADD COLUMN     "requester_employee_id" UUID;

-- CreateIndex
CREATE INDEX "req_requests_requester_employee_id_idx" ON "req_requests"("requester_employee_id");

-- READ + INSERT only. No UPDATE/DELETE: an employee cannot edit or withdraw a
-- request (out of scope); staff process it as today.
GRANT SELECT, INSERT ON "req_requests" TO app_employee;

-- An employee reads the requests THEY raised — not their client rep's, not a
-- colleague's. (Client reps read every request of their company through the
-- existing client_isolation policy, employee-raised ones included — ADR-011.)
CREATE POLICY employee_own_read ON "req_requests"
  FOR SELECT TO app_employee
  USING (requester_employee_id = NULLIF(current_setting('app.employee_id', true), '')::uuid);

-- An employee may INSERT a request only when every one of these holds:
--   * it is recorded as raised by THEM;
--   * its company is the company on THEIR OWN employee record — the subquery
--     runs as app_employee under employee_self, so it can only see that row;
--   * the staff triage fields are untouched: open, normal, no due date, no
--     assignee.
CREATE POLICY employee_raise ON "req_requests"
  FOR INSERT TO app_employee
  WITH CHECK (
        requester_employee_id = NULLIF(current_setting('app.employee_id', true), '')::uuid
    AND client_id = (
          SELECT e.client_id FROM emp_employees e
          WHERE e.id = NULLIF(current_setting('app.employee_id', true), '')::uuid
        )
    AND status = 'open'
    AND priority = 'normal'
    AND due_date IS NULL
    AND assignee_user_id IS NULL
  );

-- The request and its audit entry commit together (AUDIT-03), so the employee
-- connection must write the audit row too: INSERT only (no SELECT — the audit
-- trail is not readable by its subjects), and only for the employee's own
-- company. The AUDIT-02 arrangement for client reps, keyed on the employee.
GRANT INSERT ON "aud_entries" TO app_employee;

CREATE POLICY employee_insert ON "aud_entries"
  FOR INSERT TO app_employee
  WITH CHECK (
    client_id = (
      SELECT e.client_id FROM emp_employees e
      WHERE e.id = NULLIF(current_setting('app.employee_id', true), '')::uuid
    )
  );
