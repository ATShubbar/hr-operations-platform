-- THREAD-03 (ADR-016 rev. 2): "Ask for more detail" remembers where to return.
--
-- Staff (request.process) move an open or in-progress request to `info_needed`;
-- the request records which of the two it was in `info_returns_to`. The
-- requester's side replying (a client manager's or the raising employee's
-- comment, or a file that passed its checks) returns it THERE — open, or in
-- progress with its assignee. Staff may also move it on by hand (open, in
-- progress or cancelled). The database holds all of that, not just the app:

-- AlterTable
ALTER TABLE "req_requests" ADD COLUMN "info_returns_to" "RequestStatus";

-- The two travel together, and the return target is only ever open or in progress.
ALTER TABLE "req_requests"
  ADD CONSTRAINT "req_requests_info_returns_to_chk"
    CHECK ((status = 'info_needed') = (info_returns_to IS NOT NULL)
       AND (info_returns_to IS NULL OR info_returns_to IN ('open', 'in_progress')));

-- The ways in and out of `info_needed`, for every role. RLS sees one row at a
-- time and can't compare old with new, so this is a trigger (THREAD-02's pattern).
--   in : only from open / in progress, recording exactly that status, and never
--        by the client or employee roles (asking is staff work).
--   out: the client and employee roles may only go back to the recorded status
--        (their reply); staff may choose (open / in progress / cancelled are the
--        app's legal moves, REQ-03's workflow).
CREATE FUNCTION req_requests_info_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'info_needed' AND OLD.status IS DISTINCT FROM 'info_needed' THEN
    IF current_user IN ('app_client', 'app_employee') THEN
      RAISE EXCEPTION 'req_requests: only staff ask for more detail' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.status NOT IN ('open', 'in_progress') OR NEW.info_returns_to IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'req_requests: info_needed must come from open/in_progress and remember it'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF OLD.status = 'info_needed' AND NEW.status IS DISTINCT FROM 'info_needed' THEN
    IF current_user IN ('app_client', 'app_employee') AND NEW.status IS DISTINCT FROM OLD.info_returns_to THEN
      RAISE EXCEPTION 'req_requests: a reply returns the request to %, not %', OLD.info_returns_to, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF OLD.status = 'info_needed' AND NEW.info_returns_to IS DISTINCT FROM OLD.info_returns_to THEN
    RAISE EXCEPTION 'req_requests: where a request returns to is fixed when detail is asked'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER req_requests_info_guard
  BEFORE UPDATE ON "req_requests"
  FOR EACH ROW EXECUTE FUNCTION req_requests_info_guard();

-- The employee who raised a request may return it from info_needed by replying —
-- the only UPDATE the employee role ever makes on a request: two columns (plus
-- Prisma's updated_at), on a waiting request they raised.
GRANT UPDATE (status, info_returns_to, updated_at) ON "req_requests" TO app_employee;
CREATE POLICY employee_reply_returns ON "req_requests"
  FOR UPDATE TO app_employee
  USING (requester_employee_id = NULLIF(current_setting('app.employee_id', true), '')::uuid
         AND status = 'info_needed')
  WITH CHECK (requester_employee_id = NULLIF(current_setting('app.employee_id', true), '')::uuid);
