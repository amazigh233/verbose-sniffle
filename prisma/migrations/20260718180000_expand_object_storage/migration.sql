ALTER TABLE "CustomerDocument"
  ADD COLUMN "storageKey" TEXT,
  ADD COLUMN "sha256" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "scanStatus" TEXT NOT NULL DEFAULT 'quarantine',
  ADD COLUMN "scanMessage" TEXT NOT NULL DEFAULT '';

ALTER TABLE "QuoteAsset"
  ADD COLUMN "storageKey" TEXT,
  ADD COLUMN "sha256" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "scanStatus" TEXT NOT NULL DEFAULT 'quarantine',
  ADD COLUMN "scanMessage" TEXT NOT NULL DEFAULT '';

ALTER TABLE "ServiceDocument"
  ADD COLUMN "storageKey" TEXT;

CREATE UNIQUE INDEX "CustomerDocument_storageKey_key" ON "CustomerDocument"("storageKey");
CREATE UNIQUE INDEX "QuoteAsset_storageKey_key" ON "QuoteAsset"("storageKey");
CREATE UNIQUE INDEX "ServiceDocument_storageKey_key" ON "ServiceDocument"("storageKey");

CREATE INDEX "CustomerDocument_scanStatus_idx" ON "CustomerDocument"("scanStatus");
CREATE INDEX "QuoteAsset_scanStatus_idx" ON "QuoteAsset"("scanStatus");
