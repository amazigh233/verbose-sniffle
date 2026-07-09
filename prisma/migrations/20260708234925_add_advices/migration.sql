-- CreateTable
CREATE TABLE "Advice" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "summary" TEXT NOT NULL DEFAULT '',
    "powerKw" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "investment" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "subsidy" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "yearlySaving" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paybackYears" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "productName" TEXT NOT NULL DEFAULT '',
    "sourceQuoteId" TEXT NOT NULL DEFAULT '',
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Advice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Advice_customerId_idx" ON "Advice"("customerId");

-- AddForeignKey
ALTER TABLE "Advice" ADD CONSTRAINT "Advice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
