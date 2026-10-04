-- THREAD-02 (ADR-016): files on a request's thread.
--
-- Visible to everyone on the request; uploaded by staff, the client manager on
-- their company's requests and the employee on requests they raised (the same
-- fences as req_comments, THREAD-01). The request's client_id and
-- requester_employee_id are COPIED onto each row so the client and employee
-- policies never need a join. A file is born `pending`, and only the confirm
-- step (after the virus scan and the size/type check) can make it `available`;
-- an available file can only be `removed` (soft — the row stays). Nobody DELETEs.

-- CreateEnum
CREATE TYPE "RequestAttachmentStatus" AS ENUM ('pending', 'available', 'quarantined', 'rejected', 'removed');

-- CreateTable
CREATE TABLE "req_attachments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "requester_employee_id" UUID,
    "uploaded_by_user_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "status" "RequestAttachmentStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(3),
    "removed_at" TIMESTAMP(3),

    CONSTRAINT "req_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "req_attachments_storage_key_key" ON "req_attachments"("storage_key");

-- CreateIndex
CREATE INDEX "req_attachments_request_id_created_at_idx" ON "req_attachments"("request_id", "created_at");

-- CreateIndex
CREATE INDEX "req_attachments_client_id_idx" ON "req_attachments"("client_id");

-- AddForeignKey
ALTER TABLE "req_attachments" ADD CONSTRAINT "req_attachments_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "req_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- ---- Facts every row keeps ----------------------------------------------------------
ALTER TABLE "req_attachments"
  ADD CONSTRAINT "req_attachments_type_chk"
    CHECK (content_type IN ('application/pdf', 'image/jpeg', 'image/png')),
  ADD CONSTRAINT "req_attachments_size_chk" CHECK (size_bytes BETWEEN 1 AND 10485760),
  ADD CONSTRAINT "req_attachments_name_chk" CHECK (char_length(btrim(file_name)) BETWEEN 1 AND 200),
  ADD CONSTRAINT "req_attachments_confirmed_chk"
    CHECK ((status IN ('available', 'removed')) = (confirmed_at IS NOT NULL)),
  ADD CONSTRAINT "req_attachments_removed_chk"
    CHECK ((status = 'removed') = (removed_at IS NOT NULL));

-- ---- The only legal moves, for EVERY role (staff included) ---------------------------
-- RLS sees one row at a time and can't compare old with new, so the life cycle
-- lives in a trigger: pending → available | quarantined | rejected, and
-- available → removed. Nothing else changes on an existing row (the column
-- grants below say the same for the app roles; this also binds the owner).
CREATE FUNCTION req_attachments_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT (
       (OLD.status = 'pending' AND NEW.status IN ('available', 'quarantined', 'rejected'))
    OR (OLD.status = 'available' AND NEW.status = 'removed')
  ) THEN
    RAISE EXCEPTION 'req_attachments: % -> % is not allowed', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF (NEW.id, NEW.request_id, NEW.client_id, NEW.requester_employee_id, NEW.uploaded_by_user_id,
      NEW.file_name, NEW.content_type, NEW.storage_key, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.request_id, OLD.client_id, OLD.requester_employee_id, OLD.uploaded_by_user_id,
      OLD.file_name, OLD.content_type, OLD.storage_key, OLD.created_at) THEN
    RAISE EXCEPTION 'req_attachments: only the status, size and timestamps may change'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER req_attachments_guard
  BEFORE UPDATE ON "req_attachments"
  FOR EACH ROW EXECUTE FUNCTION req_attachments_guard();

ALTER TABLE "req_attachments" ENABLE ROW LEVEL SECURITY;

-- Every new row starts pending: no role may insert a file as already scanned.
CREATE POLICY attachment_starts_pending ON "req_attachments"
  AS RESTRICTIVE FOR INSERT TO app_staff, app_client, app_employee
  WITH CHECK (status = 'pending' AND confirmed_at IS NULL AND removed_at IS NULL);

-- ---- Staff ----------------------------------------------------------------------
GRANT SELECT, INSERT ON "req_attachments" TO app_staff;
GRANT UPDATE (status, size_bytes, confirmed_at, removed_at) ON "req_attachments" TO app_staff;
CREATE POLICY staff_full_access ON "req_attachments"
  FOR ALL TO app_staff USING (true) WITH CHECK (true);

-- ---- Client managers (own company) ------------------------------------------------
GRANT SELECT, INSERT ON "req_attachments" TO app_client;
GRANT UPDATE (status, size_bytes, confirmed_at, removed_at) ON "req_attachments" TO app_client;
CREATE POLICY client_isolation ON "req_attachments"
  FOR ALL TO app_client
  USING (client_id = NULLIF(current_setting('app.client_id', true), '')::uuid)
  WITH CHECK (client_id = NULLIF(current_setting('app.client_id', true), '')::uuid);
-- A file must belong to a request of THIS company, with the request's own
-- requester copied faithfully. Columns of the new row are QUALIFIED — unqualified
-- names resolve to the subquery's table and the check becomes a tautology
-- (the THREAD-01 landmine).
CREATE POLICY client_attach ON "req_attachments"
  AS RESTRICTIVE FOR INSERT TO app_client
  WITH CHECK (EXISTS (
    SELECT 1 FROM req_requests r
    WHERE r.id = req_attachments.request_id
      AND r.client_id = req_attachments.client_id
      AND r.requester_employee_id IS NOT DISTINCT FROM req_attachments.requester_employee_id
  ));

-- ---- Employees (requests they raised) -------------------------------------------------
GRANT SELECT, INSERT ON "req_attachments" TO app_employee;
GRANT UPDATE (status, size_bytes, confirmed_at, removed_at) ON "req_attachments" TO app_employee;
CREATE POLICY employee_own_read ON "req_attachments"
  FOR SELECT TO app_employee
  USING (requester_employee_id = NULLIF(current_setting('app.employee_id', true), '')::uuid);
CREATE POLICY employee_attach ON "req_attachments"
  FOR INSERT TO app_employee
  WITH CHECK (
        requester_employee_id = NULLIF(current_setting('app.employee_id', true), '')::uuid
    AND EXISTS (
          SELECT 1 FROM req_requests r
          WHERE r.id = req_attachments.request_id
            AND r.client_id = req_attachments.client_id
            AND r.requester_employee_id = NULLIF(current_setting('app.employee_id', true), '')::uuid
        )
  );
CREATE POLICY employee_own_update ON "req_attachments"
  FOR UPDATE TO app_employee
  USING (requester_employee_id = NULLIF(current_setting('app.employee_id', true), '')::uuid)
  WITH CHECK (requester_employee_id = NULLIF(current_setting('app.employee_id', true), '')::uuid);
