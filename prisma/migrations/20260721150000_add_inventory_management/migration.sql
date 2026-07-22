ALTER TABLE "Product"
  ADD COLUMN "sku" TEXT,
  ADD COLUMN "stockQuantity" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "minimumStock" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "stockUnit" TEXT NOT NULL DEFAULT 'stuk',
  ADD COLUMN "stockLocation" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "inventoryUpdatedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");
CREATE INDEX "Product_stockQuantity_idx" ON "Product"("stockQuantity");

CREATE TABLE "InventoryMovement" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'adjustment',
  "source" TEXT NOT NULL DEFAULT 'manual',
  "quantityBefore" DECIMAL(12,2) NOT NULL,
  "quantityAfter" DECIMAL(12,2) NOT NULL,
  "delta" DECIMAL(12,2) NOT NULL,
  "reason" TEXT NOT NULL DEFAULT '',
  "reference" TEXT NOT NULL DEFAULT '',
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InventoryMovement_productId_createdAt_idx" ON "InventoryMovement"("productId", "createdAt");
CREATE INDEX "InventoryMovement_createdAt_idx" ON "InventoryMovement"("createdAt");

ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
