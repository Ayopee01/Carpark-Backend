-- CreateIndex
CREATE INDEX "transactions_payments_gin_idx" ON "transactions" USING GIN ("payments" jsonb_path_ops);
