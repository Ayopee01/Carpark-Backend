-- DropIndex
DROP INDEX "transactions_bill_no_idx";
DROP INDEX "payment_gateway_charges_plate_no_idx";
DROP INDEX "payment_gateway_charges_status_idx";
DROP INDEX "auth_sessions_expires_at_idx";

-- AlterTable
ALTER TABLE "transactions"
  DROP COLUMN "duration_minute",
  DROP COLUMN "vat",
  DROP COLUMN "discount",
  DROP COLUMN "payment";
