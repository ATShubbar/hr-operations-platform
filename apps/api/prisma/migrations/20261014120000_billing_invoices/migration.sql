-- BILL-05 (ADR-020): INVOICE RECORDS. The invoice is issued from the
-- accounting system; this table records it — its number as issued, its dates
-- and its amount — and whether it was paid. Nothing is numbered, rendered or
-- taxed here. A fee an invoice recovers points at it and becomes `invoiced`.

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('sent', 'paid');

-- CreateTable
CREATE TABLE "bil_invoices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "issued_on" DATE NOT NULL,
    "due_on" DATE NOT NULL,
    "amount_halalas" INTEGER NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'sent',
    "paid_on" DATE,
    "recorded_by_user_id" UUID,
    "removed_at" TIMESTAMP(3),
    "removed_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bil_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bil_invoices_client_id_issued_on_idx" ON "bil_invoices"("client_id", "issued_on");

-- One LIVE record per number per client, whatever its case. A removed record
-- frees its number, so a mistake can be recorded again correctly.
CREATE UNIQUE INDEX "bil_invoices_number_per_client_idx"
  ON "bil_invoices" ("client_id", lower("number"))
  WHERE "removed_at" IS NULL;

-- A record is well-formed whoever writes it:
--   · it has a number and a positive amount;
--   · it is not due before it was issued;
--   · `paid` means there is a day it was paid, and only then; not before issue;
--   · a paid record is never a removed one (it is un-marked first).
ALTER TABLE "bil_invoices"
  ADD CONSTRAINT "bil_invoices_number_chk" CHECK (btrim("number") <> ''),
  ADD CONSTRAINT "bil_invoices_amount_chk" CHECK ("amount_halalas" > 0),
  ADD CONSTRAINT "bil_invoices_due_chk" CHECK ("due_on" >= "issued_on"),
  ADD CONSTRAINT "bil_invoices_paid_chk" CHECK (
    ("status" = 'paid') = ("paid_on" IS NOT NULL)
    AND ("paid_on" IS NULL OR "paid_on" >= "issued_on")
  ),
  ADD CONSTRAINT "bil_invoices_removed_chk" CHECK ("removed_at" IS NULL OR "status" = 'sent');

-- The fee's link to the invoice that recovers it. Both tables are Billing's
-- own, so this is a real foreign key.
ALTER TABLE "bil_fees" ADD COLUMN "invoice_id" UUID;

-- CreateIndex
CREATE INDEX "bil_fees_invoice_id_idx" ON "bil_fees"("invoice_id");

-- AddForeignKey
ALTER TABLE "bil_fees" ADD CONSTRAINT "bil_fees_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "bil_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- "Invoiced" means ON an invoice, and only then. (No route could set
-- `invoiced` before this migration, so no existing row can violate it.)
ALTER TABLE "bil_fees"
  ADD CONSTRAINT "bil_fees_invoice_chk" CHECK (("status" = 'invoiced') = ("invoice_id" IS NOT NULL));

-- STAFF-OWNED (ADR-020: client managers and employees see nothing of the
-- money): app_client and app_employee get NO grants. No DELETE — an invoice
-- record is corrected, or soft-removed, never deleted.
GRANT SELECT, INSERT, UPDATE ON "bil_invoices" TO app_staff;

ALTER TABLE "bil_invoices" ENABLE ROW LEVEL SECURITY;

CREATE POLICY staff_full_access ON "bil_invoices"
  FOR ALL TO app_staff USING (true) WITH CHECK (true);
