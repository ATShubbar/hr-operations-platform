-- BILL-02 (ADR-020): one receipt per fee.

-- CreateEnum
CREATE TYPE "FeeReceiptStatus" AS ENUM ('pending', 'available', 'quarantined', 'rejected');

-- AlterTable
ALTER TABLE "bil_fees" ADD COLUMN     "receipt_content_type" TEXT,
ADD COLUMN     "receipt_file_name" TEXT,
ADD COLUMN     "receipt_key" TEXT,
ADD COLUMN     "receipt_status" "FeeReceiptStatus";

-- A receipt is all there or not there at all: a status with no file behind it
-- (or a file with no status) is a row nobody can reason about.
ALTER TABLE "bil_fees"
  ADD CONSTRAINT "bil_fees_receipt_chk" CHECK (
    ("receipt_status" IS NULL) = ("receipt_key" IS NULL)
    AND ("receipt_status" IS NULL) = ("receipt_file_name" IS NULL)
    AND ("receipt_status" IS NULL) = ("receipt_content_type" IS NULL)
  );
