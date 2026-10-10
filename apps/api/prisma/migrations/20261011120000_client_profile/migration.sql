-- PROF-01 (ADR-019): the client profile on the client's own row.
-- Every column is optional — the existing clients predate them.

-- CreateEnum
CREATE TYPE "NitaqatBand" AS ENUM ('red', 'yellow', 'low_green', 'medium_green', 'high_green', 'platinum');

-- CreateEnum
CREATE TYPE "ServiceTier" AS ENUM ('essential', 'professional', 'enterprise');

-- CreateEnum
CREATE TYPE "ResponseCommitment" AS ENUM ('same_working_day', 'one_working_day', 'two_working_days');

-- AlterTable
ALTER TABLE "cli_clients" ADD COLUMN     "city" TEXT,
ADD COLUMN     "contact_email" TEXT,
ADD COLUMN     "contact_name_ar" TEXT,
ADD COLUMN     "contact_name_en" TEXT,
ADD COLUMN     "contact_phone" TEXT,
ADD COLUMN     "contact_role" TEXT,
ADD COLUMN     "cr_number" TEXT,
ADD COLUMN     "gosi_establishment" TEXT,
ADD COLUMN     "nitaqat_band" "NitaqatBand",
ADD COLUMN     "nitaqat_checked_on" DATE,
ADD COLUMN     "officer_user_id" UUID,
ADD COLUMN     "portals" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "qiwa_establishment" TEXT,
ADD COLUMN     "response_commitment" "ResponseCommitment",
ADD COLUMN     "sector" TEXT,
ADD COLUMN     "service_tier" "ServiceTier",
ADD COLUMN     "signatories" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "term_end" DATE,
ADD COLUMN     "term_start" DATE,
ADD COLUMN     "vat_number" TEXT;

-- No two clients share a commercial registration (NULLs do not collide).
CREATE UNIQUE INDEX "cli_clients_cr_number_key" ON "cli_clients"("cr_number");

-- The last line of validation, binding every writer:
--   a commercial registration is ten digits, a VAT number fifteen;
--   a Nitaqat band always carries the day it was checked, and no date stands
--     without a band (the band is STORED — what staff read off Qiwa);
--   a term cannot end before it starts;
--   signatories is a JSON list.
ALTER TABLE "cli_clients"
  ADD CONSTRAINT "cli_clients_cr_number_chk"
    CHECK ("cr_number" IS NULL OR "cr_number" ~ '^[0-9]{10}$'),
  ADD CONSTRAINT "cli_clients_vat_number_chk"
    CHECK ("vat_number" IS NULL OR "vat_number" ~ '^[0-9]{15}$'),
  ADD CONSTRAINT "cli_clients_nitaqat_chk"
    CHECK (("nitaqat_band" IS NULL) = ("nitaqat_checked_on" IS NULL)),
  ADD CONSTRAINT "cli_clients_term_chk"
    CHECK ("term_start" IS NULL OR "term_end" IS NULL OR "term_end" >= "term_start"),
  ADD CONSTRAINT "cli_clients_signatories_chk"
    CHECK (jsonb_typeof("signatories") = 'array');

-- Grants and row-level security are unchanged and already cover the new
-- columns (CLIENT-01): app_staff reads and writes every client; app_client
-- may SELECT its OWN row only — which is the owner's decision here (a client
-- manager reads their own company's whole profile); app_employee has nothing.
