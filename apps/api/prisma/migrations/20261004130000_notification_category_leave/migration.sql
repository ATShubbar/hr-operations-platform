-- LEAVE-02 (ADR-014): leave decisions notify whoever raised the request, under
-- their own email-preference category. Its own migration: Postgres will not use
-- a new enum value inside the transaction that adds it (the SS-01 lesson).
ALTER TYPE "NotificationCategory" ADD VALUE 'leave';
