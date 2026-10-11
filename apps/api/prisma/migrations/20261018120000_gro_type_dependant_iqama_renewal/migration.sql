-- DEP-06a (ADR-017 rev. 2): renewing ONE dependant's iqama, as a procedure on
-- the sponsoring employee.
-- (Own migration: the next one USES this value in a CHECK, and a new enum value
-- cannot be used in the transaction that adds it.)
ALTER TYPE "GroProcessType" ADD VALUE 'dependant_iqama_renewal';
