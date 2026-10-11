-- INS-01: two document categories, so an uploaded insurance policy / card and a
-- driving licence can be matched to their rows on the employee record.
-- (Own migration, as with every enum value here: a new value cannot be USED in
-- the transaction that adds it.)
ALTER TYPE "DocumentCategory" ADD VALUE 'medical_insurance';
ALTER TYPE "DocumentCategory" ADD VALUE 'driving_licence';
