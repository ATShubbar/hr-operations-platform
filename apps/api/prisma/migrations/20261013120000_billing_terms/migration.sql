-- BILL-04 (ADR-020): a client's commercial terms — ONE row per client.
-- A platform fee plus a rate per employee under management, both per month and
-- in whole halalas, billed on a cycle; a purchase-order number and the payment
-- terms in days. The tier and the term dates are NOT here: ADR-019 keeps them
-- on the client's profile.

-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('monthly', 'quarterly', 'annual');

-- CreateTable
CREATE TABLE "bil_terms" (
    "client_id" UUID NOT NULL,
    "platform_fee_halalas" INTEGER NOT NULL,
    "seat_rate_halalas" INTEGER NOT NULL,
    "cycle" "BillingCycle" NOT NULL,
    "po_number" TEXT,
    "payment_terms_days" INTEGER NOT NULL,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bil_terms_pkey" PRIMARY KEY ("client_id")
);

-- A set of terms is well-formed whoever writes it: amounts are not negative
-- and stay within what the API accepts (SAR 1,000,000 a month), payment terms
-- are a number of days within a year, and a purchase order is not blank.
ALTER TABLE "bil_terms"
  ADD CONSTRAINT "bil_terms_amounts_chk" CHECK (
    "platform_fee_halalas" BETWEEN 0 AND 100000000
    AND "seat_rate_halalas" BETWEEN 0 AND 100000000
  ),
  ADD CONSTRAINT "bil_terms_payment_days_chk" CHECK ("payment_terms_days" BETWEEN 0 AND 365),
  ADD CONSTRAINT "bil_terms_po_chk" CHECK ("po_number" IS NULL OR btrim("po_number") <> '');

-- STAFF-OWNED (ADR-020: client managers and employees see nothing of the
-- money): app_client and app_employee get NO grants. No DELETE — terms are
-- replaced, and every replacement is audited before → after.
GRANT SELECT, INSERT, UPDATE ON "bil_terms" TO app_staff;

ALTER TABLE "bil_terms" ENABLE ROW LEVEL SECURITY;

CREATE POLICY staff_full_access ON "bil_terms"
  FOR ALL TO app_staff USING (true) WITH CHECK (true);
