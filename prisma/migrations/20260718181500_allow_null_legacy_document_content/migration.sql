-- The expand/migrate/contract flow clears legacy blobs only after each object
-- has been stored successfully. Allow that intermediate NULL state until the
-- following contract migration removes these columns.
ALTER TABLE "CustomerDocument" ALTER COLUMN "content" DROP NOT NULL;
ALTER TABLE "QuoteAsset" ALTER COLUMN "content" DROP NOT NULL;
ALTER TABLE "ServiceDocument" ALTER COLUMN "content" DROP NOT NULL;
