-- SOON-04: a candidate's target date — the day they are meant to be in post by.
-- Optional; a calendar day. Health (on track / at risk / past target) is worked
-- out from it by the screens and is never stored.
-- No grant change: rec_candidates is staff-owned (app_client and app_employee
-- hold nothing on it), and app_staff's table-level grants cover the new column.
ALTER TABLE "rec_candidates" ADD COLUMN "target_date" DATE;
