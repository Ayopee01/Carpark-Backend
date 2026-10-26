-- AlterTable
ALTER TABLE "payment_gateway_charges"
  ADD COLUMN "refund_method" TEXT,
  ADD COLUMN "refund_id" TEXT;
