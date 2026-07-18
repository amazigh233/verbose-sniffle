ALTER TABLE "Quote" ADD COLUMN "documentConfig" JSONB;

CREATE TABLE "QuoteAsset" (
  "id" TEXT NOT NULL,
  "quoteId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'product',
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL DEFAULT 'image/webp',
  "size" INTEGER NOT NULL,
  "width" INTEGER NOT NULL DEFAULT 0,
  "height" INTEGER NOT NULL DEFAULT 0,
  "content" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuoteAsset_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "QuoteAsset_quoteId_createdAt_idx" ON "QuoteAsset"("quoteId", "createdAt");
ALTER TABLE "QuoteAsset" ADD CONSTRAINT "QuoteAsset_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
