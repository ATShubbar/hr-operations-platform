-- MOB-04b (ADR-018): the candidate stage "Visa & mobilisation". On its OWN
-- migration — Postgres will not use a new enum value in the adding transaction.
ALTER TYPE "CandidateStage" ADD VALUE 'mobilisation';
