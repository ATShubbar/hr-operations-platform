-- MOB-04a (ADR-018): the employment status of someone mid-mobilisation — hired,
-- not yet arrived. On its OWN migration: Postgres will not use a new enum value
-- in the transaction that adds it (the SS-01 landmine).
ALTER TYPE "EmploymentStatus" ADD VALUE 'onboarding';
