CREATE TABLE "WascoOrder" (
  "id" TEXT NOT NULL,
  "orderNumber" TEXT NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'demo',
  "status" TEXT NOT NULL DEFAULT 'concept',
  "submitted" BOOLEAN NOT NULL DEFAULT false,
  "reference" TEXT NOT NULL DEFAULT '',
  "deliveryMethod" TEXT NOT NULL DEFAULT 'delivery',
  "deliveryLocation" TEXT NOT NULL DEFAULT '',
  "notes" TEXT NOT NULL DEFAULT '',
  "totalQuantity" INTEGER NOT NULL DEFAULT 0,
  "subtotalExVat" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WascoOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WascoOrderLine" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "productId" TEXT,
  "sku" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "brand" TEXT NOT NULL DEFAULT 'Wasco',
  "category" TEXT NOT NULL DEFAULT 'Overig',
  "unit" TEXT NOT NULL DEFAULT 'stuk',
  "quantity" INTEGER NOT NULL,
  "priceExVat" DECIMAL(14,2) NOT NULL DEFAULT 0,
  CONSTRAINT "WascoOrderLine_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "InventoryMovement" ADD COLUMN "wascoOrderId" TEXT;

CREATE UNIQUE INDEX "WascoOrder_orderNumber_key" ON "WascoOrder"("orderNumber");
CREATE INDEX "WascoOrder_createdAt_idx" ON "WascoOrder"("createdAt");
CREATE INDEX "WascoOrder_createdById_idx" ON "WascoOrder"("createdById");
CREATE INDEX "WascoOrderLine_orderId_idx" ON "WascoOrderLine"("orderId");
CREATE INDEX "WascoOrderLine_productId_idx" ON "WascoOrderLine"("productId");
CREATE INDEX "WascoOrderLine_sku_idx" ON "WascoOrderLine"("sku");
CREATE INDEX "InventoryMovement_wascoOrderId_idx" ON "InventoryMovement"("wascoOrderId");

ALTER TABLE "WascoOrder" ADD CONSTRAINT "WascoOrder_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WascoOrderLine" ADD CONSTRAINT "WascoOrderLine_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "WascoOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WascoOrderLine" ADD CONSTRAINT "WascoOrderLine_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_wascoOrderId_fkey"
  FOREIGN KEY ("wascoOrderId") REFERENCES "WascoOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
