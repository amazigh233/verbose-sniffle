ALTER TABLE "Product"
  ADD COLUMN "adviceType" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "capacityKw" DECIMAL(8,2) NOT NULL DEFAULT 0,
  ADD COLUMN "capacityKwh" DECIMAL(8,2) NOT NULL DEFAULT 0,
  ADD COLUMN "connection" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "subsidy" DECIMAL(14,2) NOT NULL DEFAULT 0;

UPDATE "Product" SET "adviceType" = 'allelectric', "capacityKw" = 8, "subsidy" = 3750 WHERE "id" = 'prod-wp-8-ae';
UPDATE "Product" SET "adviceType" = 'allelectric', "capacityKw" = 12, "subsidy" = 4650 WHERE "id" = 'prod-wp-12-ae';
UPDATE "Product" SET "adviceType" = 'hybride', "capacityKw" = 8, "subsidy" = 3025 WHERE "id" = 'prod-wp-8-hyb';
UPDATE "Product" SET "adviceType" = 'hybride', "capacityKw" = 12, "subsidy" = 3700 WHERE "id" = 'prod-wp-12-hyb';
UPDATE "Product" SET "capacityKwh" = 10, "connection" = '1fase' WHERE "id" = 'prod-bat-a10';
UPDATE "Product" SET "capacityKwh" = 21, "connection" = '1fase' WHERE "id" = 'prod-bat-a21';
UPDATE "Product" SET "capacityKwh" = 10, "connection" = '3fase' WHERE "id" = 'prod-bat-t10';
UPDATE "Product" SET "capacityKwh" = 15, "connection" = '3fase' WHERE "id" = 'prod-bat-t15';
UPDATE "Product" SET "capacityKwh" = 21, "connection" = '3fase' WHERE "id" = 'prod-bat-t21';
UPDATE "Product" SET "capacityKwh" = 30, "connection" = '3fase' WHERE "id" = 'prod-bat-t30';
UPDATE "Product" SET "capacityKwh" = 40, "connection" = '3fase' WHERE "id" = 'prod-bat-t40';
