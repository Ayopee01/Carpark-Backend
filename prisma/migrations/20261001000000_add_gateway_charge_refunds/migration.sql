ALTER TABLE "payment_gateway_charges"
  ADD COLUMN "refund_amount" INTEGER,
  ADD COLUMN "refund_reason" TEXT,
  ADD COLUMN "refund_resolved_at" TIMESTAMPTZ(6),
  ADD COLUMN "refund_note" TEXT,
  ADD COLUMN "refund_resolved_by" TEXT;

CREATE INDEX "payment_gateway_charges_refund_amount_idx" ON "payment_gateway_charges"("refund_amount");
