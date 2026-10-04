-- THREAD-01 (ADR-016): comments on a request's thread.
--
-- Visible to everyone on the request; written by staff, the client manager on
-- their company's requests and the employee on requests they raised. The
-- request's client_id and requester_employee_id are COPIED onto each comment
-- so the client and employee policies never need a join (the table checklists).
-- Nobody — staff included — may UPDATE or DELETE a comment: a thread is a record.

-- CreateTable
CREATE TABLE "req_comments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "requester_employee_id" UUID,
    "author_user_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "req_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "req_comments_request_id_created_at_idx" ON "req_comments"("request_id", "created_at");

-- CreateIndex
CREATE INDEX "req_comments_client_id_idx" ON "req_comments"("client_id");

-- AddForeignKey
ALTER TABLE "req_comments" ADD CONSTRAINT "req_comments_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "req_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "req_comments"
  ADD CONSTRAINT "req_comments_body_chk" CHECK (char_length(btrim(body)) BETWEEN 1 AND 4000);

ALTER TABLE "req_comments" ENABLE ROW LEVEL SECURITY;

-- ---- Staff ----------------------------------------------------------------------
GRANT SELECT, INSERT ON "req_comments" TO app_staff;
CREATE POLICY staff_full_access ON "req_comments"
  FOR ALL TO app_staff USING (true) WITH CHECK (true);

-- ---- Client managers (own company) ------------------------------------------------
GRANT SELECT, INSERT ON "req_comments" TO app_client;
CREATE POLICY client_isolation ON "req_comments"
  FOR ALL TO app_client
  USING (client_id = NULLIF(current_setting('app.client_id', true), '')::uuid)
  WITH CHECK (client_id = NULLIF(current_setting('app.client_id', true), '')::uuid);
-- A comment must belong to a request of THIS company, with the request's own
-- requester copied faithfully (the subquery runs under the client's own
-- req_requests policy, so another company's request is simply not there).
-- The new row's columns are QUALIFIED (req_comments.…): unqualified, client_id
-- inside the subquery resolves to r.client_id and the check compares a column
-- with itself — always true. THREAD-01's fence test caught exactly that.
CREATE POLICY client_comment ON "req_comments"
  AS RESTRICTIVE FOR INSERT TO app_client
  WITH CHECK (EXISTS (
    SELECT 1 FROM req_requests r
    WHERE r.id = req_comments.request_id
      AND r.client_id = req_comments.client_id
      AND r.requester_employee_id IS NOT DISTINCT FROM req_comments.requester_employee_id
  ));

-- ---- Employees (requests they raised) -------------------------------------------------
GRANT SELECT, INSERT ON "req_comments" TO app_employee;
CREATE POLICY employee_own_read ON "req_comments"
  FOR SELECT TO app_employee
  USING (requester_employee_id = NULLIF(current_setting('app.employee_id', true), '')::uuid);
-- Only on a request THEY raised (visible to them under employee_own_read on
-- req_requests), with its company copied faithfully.
CREATE POLICY employee_comment ON "req_comments"
  FOR INSERT TO app_employee
  WITH CHECK (
        requester_employee_id = NULLIF(current_setting('app.employee_id', true), '')::uuid
    AND EXISTS (
          SELECT 1 FROM req_requests r
          WHERE r.id = req_comments.request_id
            AND r.client_id = req_comments.client_id
            AND r.requester_employee_id = NULLIF(current_setting('app.employee_id', true), '')::uuid
        )
  );
