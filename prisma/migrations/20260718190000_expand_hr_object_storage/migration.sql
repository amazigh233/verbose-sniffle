ALTER TABLE "EmploymentContract" ADD COLUMN "storageKey" TEXT;
ALTER TABLE "EmployeeQualification" ADD COLUMN "evidenceStorageKey" TEXT;

CREATE UNIQUE INDEX "EmploymentContract_storageKey_key" ON "EmploymentContract"("storageKey");
CREATE UNIQUE INDEX "EmployeeQualification_evidenceStorageKey_key" ON "EmployeeQualification"("evidenceStorageKey");
