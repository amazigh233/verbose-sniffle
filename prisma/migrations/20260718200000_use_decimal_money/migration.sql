-- Monetary values are stored as fixed precision decimals. Existing values use
-- commercial half-up rounding at the database boundary.
ALTER TABLE "Advice"
  ALTER COLUMN "investment" TYPE DECIMAL(14,2) USING ROUND("investment"::numeric, 2),
  ALTER COLUMN "subsidy" TYPE DECIMAL(14,2) USING ROUND("subsidy"::numeric, 2),
  ALTER COLUMN "yearlySaving" TYPE DECIMAL(14,2) USING ROUND("yearlySaving"::numeric, 2);

ALTER TABLE "Product"
  ALTER COLUMN "priceExVat" TYPE DECIMAL(14,2) USING ROUND("priceExVat"::numeric, 2),
  ALTER COLUMN "vatRate" TYPE DECIMAL(5,2) USING ROUND("vatRate"::numeric, 2);

ALTER TABLE "Quote"
  ALTER COLUMN "benefitAmount" TYPE DECIMAL(14,2) USING ROUND("benefitAmount"::numeric, 2),
  ALTER COLUMN "subtotal" TYPE DECIMAL(14,2) USING ROUND("subtotal"::numeric, 2),
  ALTER COLUMN "vat" TYPE DECIMAL(14,2) USING ROUND("vat"::numeric, 2),
  ALTER COLUMN "total" TYPE DECIMAL(14,2) USING ROUND("total"::numeric, 2);

ALTER TABLE "SalesOpportunity" ALTER COLUMN "expectedValue" TYPE DECIMAL(14,2) USING ROUND("expectedValue"::numeric, 2);

ALTER TABLE "QuoteLine"
  ALTER COLUMN "qty" TYPE DECIMAL(12,3) USING ROUND("qty"::numeric, 3),
  ALTER COLUMN "priceExVat" TYPE DECIMAL(14,2) USING ROUND("priceExVat"::numeric, 2),
  ALTER COLUMN "vatRate" TYPE DECIMAL(5,2) USING ROUND("vatRate"::numeric, 2),
  ALTER COLUMN "subtotal" TYPE DECIMAL(14,2) USING ROUND("subtotal"::numeric, 2),
  ALTER COLUMN "vat" TYPE DECIMAL(14,2) USING ROUND("vat"::numeric, 2),
  ALTER COLUMN "total" TYPE DECIMAL(14,2) USING ROUND("total"::numeric, 2);

ALTER TABLE "Invoice"
  ALTER COLUMN "subtotal" TYPE DECIMAL(14,2) USING ROUND("subtotal"::numeric, 2),
  ALTER COLUMN "vat" TYPE DECIMAL(14,2) USING ROUND("vat"::numeric, 2),
  ALTER COLUMN "total" TYPE DECIMAL(14,2) USING ROUND("total"::numeric, 2);

ALTER TABLE "InvoiceLine"
  ALTER COLUMN "qty" TYPE DECIMAL(12,3) USING ROUND("qty"::numeric, 3),
  ALTER COLUMN "priceExVat" TYPE DECIMAL(14,2) USING ROUND("priceExVat"::numeric, 2),
  ALTER COLUMN "vatRate" TYPE DECIMAL(5,2) USING ROUND("vatRate"::numeric, 2),
  ALTER COLUMN "subtotal" TYPE DECIMAL(14,2) USING ROUND("subtotal"::numeric, 2),
  ALTER COLUMN "vat" TYPE DECIMAL(14,2) USING ROUND("vat"::numeric, 2),
  ALTER COLUMN "total" TYPE DECIMAL(14,2) USING ROUND("total"::numeric, 2);

ALTER TABLE "ProjectMaterial" ALTER COLUMN "purchasePrice" TYPE DECIMAL(14,2) USING ROUND("purchasePrice"::numeric, 2);
ALTER TABLE "ServiceContract" ALTER COLUMN "price" TYPE DECIMAL(14,2) USING ROUND("price"::numeric, 2);
