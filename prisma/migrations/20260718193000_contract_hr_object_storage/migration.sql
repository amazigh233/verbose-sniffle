DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "EmploymentContract" WHERE "storageKey" IS NULL)
    OR EXISTS (
      SELECT 1 FROM "EmployeeQualification"
      WHERE "evidenceCipher" IS NOT NULL AND "evidenceStorageKey" IS NULL
    ) THEN
    RAISE EXCEPTION 'Legacy HR file blobs must be migrated with npm run documents:migrate-hr-storage before applying this migration';
  END IF;
END $$;

ALTER TABLE "EmploymentContract" ALTER COLUMN "storageKey" SET NOT NULL;

ALTER TABLE "EmploymentContract"
  DROP COLUMN "fileCipher",
  DROP COLUMN "fileIv",
  DROP COLUMN "fileTag";

ALTER TABLE "EmployeeQualification"
  DROP COLUMN "evidenceCipher",
  DROP COLUMN "evidenceIv",
  DROP COLUMN "evidenceTag";
