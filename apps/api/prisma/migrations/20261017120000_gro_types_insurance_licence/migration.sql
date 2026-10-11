-- INS-04: three procedure types — renewing a medical insurance policy, renewing
-- a driving licence, and converting a foreign licence to a Saudi one.
-- (Own migration: a new enum value cannot be USED in the transaction that adds it.)
ALTER TYPE "GroProcessType" ADD VALUE 'medical_insurance_renewal';
ALTER TYPE "GroProcessType" ADD VALUE 'driving_licence_renewal';
ALTER TYPE "GroProcessType" ADD VALUE 'driving_licence_conversion';
