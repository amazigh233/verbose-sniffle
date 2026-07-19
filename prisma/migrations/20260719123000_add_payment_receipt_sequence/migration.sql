CREATE TABLE "PaymentReceiptSequence" (
  "year" INTEGER NOT NULL,
  "value" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentReceiptSequence_pkey" PRIMARY KEY ("year"),
  CONSTRAINT "PaymentReceiptSequence_value_check" CHECK ("value" > 0)
);
