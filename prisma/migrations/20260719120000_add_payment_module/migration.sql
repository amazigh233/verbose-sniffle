-- Payment aggregates, cash drawer shifts, immutable receipts and hash-chained ledger.
CREATE TABLE "CashDrawer" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CashDrawer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CashDrawerShift" (
  "id" TEXT NOT NULL,
  "drawerId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "openingBalance" DECIMAL(14,2) NOT NULL,
  "expectedClosingBalance" DECIMAL(14,2),
  "closingBalance" DECIMAL(14,2),
  "variance" DECIMAL(14,2),
  "settlement" JSONB,
  "notes" TEXT NOT NULL DEFAULT '',
  "openedById" TEXT,
  "closedById" TEXT,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),
  CONSTRAINT "CashDrawerShift_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CashDrawerShift_status_check" CHECK ("status" IN ('open', 'closed')),
  CONSTRAINT "CashDrawerShift_opening_balance_check" CHECK ("openingBalance" >= 0),
  CONSTRAINT "CashDrawerShift_closing_state_check" CHECK (
    ("status" = 'open' AND "closedAt" IS NULL AND "closingBalance" IS NULL) OR
    ("status" = 'closed' AND "closedAt" IS NOT NULL AND "closingBalance" IS NOT NULL AND "expectedClosingBalance" IS NOT NULL AND "variance" IS NOT NULL)
  )
);

CREATE TABLE "Payment" (
  "id" TEXT NOT NULL,
  "invoiceId" TEXT,
  "customerId" TEXT,
  "createdById" TEXT,
  "cancelledById" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "currency" TEXT NOT NULL DEFAULT 'EUR',
  "subtotal" DECIMAL(14,2) NOT NULL,
  "discountAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "discountReason" TEXT NOT NULL DEFAULT '',
  "tipAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "totalAmount" DECIMAL(14,2) NOT NULL,
  "paidAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "refundedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "cancellationReason" TEXT NOT NULL DEFAULT '',
  "completedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Payment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Payment_status_check" CHECK ("status" IN ('pending', 'partially_paid', 'paid', 'partially_refunded', 'refunded', 'cancelled')),
  CONSTRAINT "Payment_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "Payment_amounts_check" CHECK (
    "subtotal" > 0 AND "discountAmount" >= 0 AND "discountAmount" <= "subtotal" AND
    "tipAmount" >= 0 AND "totalAmount" = "subtotal" - "discountAmount" + "tipAmount" AND
    "paidAmount" >= 0 AND
    "refundedAmount" >= 0 AND "refundedAmount" <= "paidAmount"
  )
);

CREATE TABLE "PaymentTender" (
  "id" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "shiftId" TEXT,
  "createdById" TEXT,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'captured',
  "amount" DECIMAL(14,2) NOT NULL,
  "amountReceived" DECIMAL(14,2) NOT NULL,
  "changeAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "provider" TEXT NOT NULL DEFAULT '',
  "externalReference" TEXT NOT NULL DEFAULT '',
  "cardBrand" TEXT NOT NULL DEFAULT '',
  "cardLast4" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "cancelledAt" TIMESTAMP(3),
  CONSTRAINT "PaymentTender_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentTender_type_check" CHECK ("type" IN ('cash', 'pin', 'credit_card', 'apple_pay', 'google_pay')),
  CONSTRAINT "PaymentTender_status_check" CHECK ("status" IN ('captured', 'cancelled')),
  CONSTRAINT "PaymentTender_amounts_check" CHECK (
    "amount" > 0 AND "amountReceived" >= "amount" AND "changeAmount" = "amountReceived" - "amount"
  ),
  CONSTRAINT "PaymentTender_cash_check" CHECK (
    ("type" = 'cash' AND "shiftId" IS NOT NULL AND "provider" = '' AND "externalReference" = '') OR
    ("type" <> 'cash' AND "amountReceived" = "amount" AND "changeAmount" = 0 AND "provider" <> '' AND "externalReference" <> '')
  )
);

CREATE TABLE "PaymentRefund" (
  "id" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "createdById" TEXT,
  "amount" DECIMAL(14,2) NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentRefund_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentRefund_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "PaymentRefund_reason_check" CHECK (length(btrim("reason")) > 0)
);

CREATE TABLE "PaymentRefundAllocation" (
  "id" TEXT NOT NULL,
  "refundId" TEXT NOT NULL,
  "tenderId" TEXT NOT NULL,
  "shiftId" TEXT,
  "amount" DECIMAL(14,2) NOT NULL,
  "externalReference" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentRefundAllocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentRefundAllocation_amount_check" CHECK ("amount" > 0)
);

CREATE TABLE "PaymentReceipt" (
  "id" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "refundId" TEXT,
  "kind" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentReceipt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentReceipt_kind_check" CHECK ("kind" IN ('payment', 'refund', 'cancellation'))
);

CREATE TABLE "PaymentOperation" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentOperation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentLedgerEntry" (
  "id" TEXT NOT NULL,
  "paymentId" TEXT,
  "shiftId" TEXT,
  "aggregateType" TEXT NOT NULL,
  "aggregateId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "transactionId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "tenderType" TEXT NOT NULL DEFAULT '',
  "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'EUR',
  "payload" JSONB NOT NULL,
  "previousHash" TEXT NOT NULL DEFAULT '',
  "hash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentLedgerEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentLedgerEntry_sequence_check" CHECK ("sequence" > 0),
  CONSTRAINT "PaymentLedgerEntry_aggregate_check" CHECK (
    ("aggregateType" = 'payment' AND "paymentId" IS NOT NULL AND "shiftId" IS NULL AND "aggregateId" = "paymentId") OR
    ("aggregateType" = 'shift' AND "shiftId" IS NOT NULL AND "paymentId" IS NULL AND "aggregateId" = "shiftId")
  )
);

CREATE UNIQUE INDEX "CashDrawer_name_key" ON "CashDrawer"("name");
CREATE INDEX "CashDrawer_active_name_idx" ON "CashDrawer"("active", "name");
CREATE UNIQUE INDEX "CashDrawerShift_one_open_per_drawer" ON "CashDrawerShift"("drawerId") WHERE "status" = 'open';
CREATE INDEX "CashDrawerShift_drawerId_openedAt_idx" ON "CashDrawerShift"("drawerId", "openedAt");
CREATE INDEX "CashDrawerShift_status_openedAt_idx" ON "CashDrawerShift"("status", "openedAt");
CREATE UNIQUE INDEX "Payment_invoiceId_key" ON "Payment"("invoiceId");
CREATE INDEX "Payment_customerId_createdAt_idx" ON "Payment"("customerId", "createdAt");
CREATE INDEX "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt");
CREATE INDEX "Payment_createdAt_idx" ON "Payment"("createdAt");
CREATE INDEX "PaymentTender_paymentId_createdAt_idx" ON "PaymentTender"("paymentId", "createdAt");
CREATE INDEX "PaymentTender_shiftId_type_createdAt_idx" ON "PaymentTender"("shiftId", "type", "createdAt");
CREATE INDEX "PaymentTender_externalReference_idx" ON "PaymentTender"("externalReference");
CREATE UNIQUE INDEX "PaymentTender_provider_reference_key" ON "PaymentTender"("provider", "externalReference") WHERE "externalReference" <> '';
CREATE INDEX "PaymentRefund_paymentId_createdAt_idx" ON "PaymentRefund"("paymentId", "createdAt");
CREATE INDEX "PaymentRefundAllocation_refundId_idx" ON "PaymentRefundAllocation"("refundId");
CREATE INDEX "PaymentRefundAllocation_tenderId_createdAt_idx" ON "PaymentRefundAllocation"("tenderId", "createdAt");
CREATE INDEX "PaymentRefundAllocation_shiftId_createdAt_idx" ON "PaymentRefundAllocation"("shiftId", "createdAt");
CREATE UNIQUE INDEX "PaymentRefundAllocation_reference_key" ON "PaymentRefundAllocation"("externalReference") WHERE "externalReference" <> '';
CREATE UNIQUE INDEX "PaymentReceipt_number_key" ON "PaymentReceipt"("number");
CREATE UNIQUE INDEX "PaymentReceipt_refundId_key" ON "PaymentReceipt"("refundId");
CREATE INDEX "PaymentReceipt_paymentId_createdAt_idx" ON "PaymentReceipt"("paymentId", "createdAt");
CREATE INDEX "PaymentReceipt_createdAt_idx" ON "PaymentReceipt"("createdAt");
CREATE UNIQUE INDEX "PaymentOperation_idempotencyKey_key" ON "PaymentOperation"("idempotencyKey");
CREATE INDEX "PaymentOperation_paymentId_createdAt_idx" ON "PaymentOperation"("paymentId", "createdAt");
CREATE UNIQUE INDEX "PaymentLedgerEntry_hash_key" ON "PaymentLedgerEntry"("hash");
CREATE UNIQUE INDEX "PaymentLedgerEntry_aggregate_sequence_key" ON "PaymentLedgerEntry"("aggregateType", "aggregateId", "sequence");
CREATE INDEX "PaymentLedgerEntry_paymentId_sequence_idx" ON "PaymentLedgerEntry"("paymentId", "sequence");
CREATE INDEX "PaymentLedgerEntry_shiftId_sequence_idx" ON "PaymentLedgerEntry"("shiftId", "sequence");
CREATE INDEX "PaymentLedgerEntry_createdAt_idx" ON "PaymentLedgerEntry"("createdAt");

ALTER TABLE "CashDrawerShift" ADD CONSTRAINT "CashDrawerShift_drawerId_fkey" FOREIGN KEY ("drawerId") REFERENCES "CashDrawer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashDrawerShift" ADD CONSTRAINT "CashDrawerShift_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashDrawerShift" ADD CONSTRAINT "CashDrawerShift_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PaymentTender" ADD CONSTRAINT "PaymentTender_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentTender" ADD CONSTRAINT "PaymentTender_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "CashDrawerShift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentTender" ADD CONSTRAINT "PaymentTender_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PaymentRefund" ADD CONSTRAINT "PaymentRefund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentRefund" ADD CONSTRAINT "PaymentRefund_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PaymentRefundAllocation" ADD CONSTRAINT "PaymentRefundAllocation_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "PaymentRefund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentRefundAllocation" ADD CONSTRAINT "PaymentRefundAllocation_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "PaymentTender"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentRefundAllocation" ADD CONSTRAINT "PaymentRefundAllocation_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "CashDrawerShift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentReceipt" ADD CONSTRAINT "PaymentReceipt_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentReceipt" ADD CONSTRAINT "PaymentReceipt_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "PaymentRefund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentOperation" ADD CONSTRAINT "PaymentOperation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentLedgerEntry" ADD CONSTRAINT "PaymentLedgerEntry_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentLedgerEntry" ADD CONSTRAINT "PaymentLedgerEntry_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "CashDrawerShift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION reject_immutable_payment_record_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'immutable payment record cannot be changed' USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PaymentLedgerEntry_immutable"
BEFORE UPDATE OR DELETE ON "PaymentLedgerEntry"
FOR EACH ROW EXECUTE FUNCTION reject_immutable_payment_record_mutation();

CREATE TRIGGER "PaymentReceipt_immutable"
BEFORE UPDATE OR DELETE ON "PaymentReceipt"
FOR EACH ROW EXECUTE FUNCTION reject_immutable_payment_record_mutation();

CREATE TRIGGER "PaymentOperation_immutable"
BEFORE UPDATE OR DELETE ON "PaymentOperation"
FOR EACH ROW EXECUTE FUNCTION reject_immutable_payment_record_mutation();
