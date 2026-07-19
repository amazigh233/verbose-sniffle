-- Refund truth is permanently preserved by PaymentLedgerEntry and PaymentReceipt.
-- Refund projections remain eligible for FK-driven actor anonymisation.
DROP TRIGGER IF EXISTS "PaymentRefund_immutable" ON "PaymentRefund";
DROP TRIGGER IF EXISTS "PaymentRefundAllocation_immutable" ON "PaymentRefundAllocation";
