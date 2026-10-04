-- THREAD-03 (ADR-016): "Ask for more detail" — a request waiting on its requester.
-- Its own migration: Postgres won't use a new enum value inside the transaction
-- that adds it, and the next migration's CHECK and trigger name it.
ALTER TYPE "RequestStatus" ADD VALUE 'info_needed' AFTER 'in_progress';
