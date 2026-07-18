DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "CustomerDocument" WHERE "storageKey" IS NULL)
    OR EXISTS (SELECT 1 FROM "QuoteAsset" WHERE "storageKey" IS NULL)
    OR EXISTS (SELECT 1 FROM "ServiceDocument" WHERE "storageKey" IS NULL) THEN
    RAISE EXCEPTION 'Legacy document blobs must be migrated with npm run documents:migrate-storage before applying this migration';
  END IF;
END $$;

ALTER TABLE "CustomerDocument" ALTER COLUMN "storageKey" SET NOT NULL;
ALTER TABLE "QuoteAsset" ALTER COLUMN "storageKey" SET NOT NULL;
ALTER TABLE "ServiceDocument" ALTER COLUMN "storageKey" SET NOT NULL;

ALTER TABLE "CustomerDocument" DROP COLUMN "content";
ALTER TABLE "QuoteAsset" DROP COLUMN "content";
ALTER TABLE "ServiceDocument" DROP COLUMN "content";
