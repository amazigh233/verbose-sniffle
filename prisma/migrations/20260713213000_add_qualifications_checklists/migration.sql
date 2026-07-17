ALTER TABLE "Installation"
  ADD COLUMN "workType" TEXT NOT NULL DEFAULT 'other',
  ADD COLUMN "qualificationCheck" JSONB;

CREATE TABLE "QualificationDefinition" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'certificate',
  "description" TEXT NOT NULL DEFAULT '',
  "evidencePolicy" TEXT NOT NULL DEFAULT 'required',
  "defaultValidityMonths" INTEGER,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QualificationDefinition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmployeeQualification" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "definitionId" TEXT NOT NULL,
  "issuer" TEXT NOT NULL DEFAULT '',
  "certificateNumber" TEXT NOT NULL DEFAULT '',
  "issueDate" TEXT NOT NULL DEFAULT '',
  "expiryDate" TEXT NOT NULL DEFAULT '',
  "skillLevel" TEXT NOT NULL DEFAULT '',
  "noteCipher" BYTEA,
  "noteIv" BYTEA,
  "noteTag" BYTEA,
  "evidenceFileName" TEXT NOT NULL DEFAULT '',
  "evidenceMimeType" TEXT NOT NULL DEFAULT '',
  "evidenceSize" INTEGER NOT NULL DEFAULT 0,
  "evidenceSha256" TEXT NOT NULL DEFAULT '',
  "evidenceScanStatus" TEXT NOT NULL DEFAULT 'missing',
  "evidenceScanMessage" TEXT NOT NULL DEFAULT '',
  "evidenceCipher" BYTEA,
  "evidenceIv" BYTEA,
  "evidenceTag" BYTEA,
  "keyVersion" TEXT NOT NULL DEFAULT 'v1',
  "archivedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmployeeQualification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QualificationRequirement" (
  "id" TEXT NOT NULL,
  "workType" TEXT NOT NULL,
  "definitionId" TEXT NOT NULL,
  "minimumLevel" TEXT NOT NULL DEFAULT '',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QualificationRequirement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChecklistTemplate" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChecklistTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChecklistTemplateItem" (
  "id" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "dueOffsetDays" INTEGER NOT NULL DEFAULT 0,
  "required" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "defaultAssigneeId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChecklistTemplateItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmployeeChecklist" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "templateId" TEXT,
  "type" TEXT NOT NULL,
  "templateVersion" INTEGER NOT NULL,
  "anchorDate" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "sourceKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "EmployeeChecklist_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmployeeChecklistItem" (
  "id" TEXT NOT NULL,
  "checklistId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "dueDate" TEXT NOT NULL,
  "required" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "assignedToId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'open',
  "noteCipher" BYTEA,
  "noteIv" BYTEA,
  "noteTag" BYTEA,
  "keyVersion" TEXT NOT NULL DEFAULT 'v1',
  "completedAt" TIMESTAMP(3),
  "completedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmployeeChecklistItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QualificationDefinition_code_key" ON "QualificationDefinition"("code");
CREATE INDEX "QualificationDefinition_active_sortOrder_idx" ON "QualificationDefinition"("active", "sortOrder");
CREATE INDEX "EmployeeQualification_employeeId_archivedAt_idx" ON "EmployeeQualification"("employeeId", "archivedAt");
CREATE INDEX "EmployeeQualification_definitionId_expiryDate_idx" ON "EmployeeQualification"("definitionId", "expiryDate");
CREATE INDEX "EmployeeQualification_evidenceScanStatus_idx" ON "EmployeeQualification"("evidenceScanStatus");
CREATE UNIQUE INDEX "QualificationRequirement_workType_definitionId_key" ON "QualificationRequirement"("workType", "definitionId");
CREATE INDEX "QualificationRequirement_workType_active_idx" ON "QualificationRequirement"("workType", "active");
CREATE UNIQUE INDEX "ChecklistTemplate_type_key" ON "ChecklistTemplate"("type");
CREATE INDEX "ChecklistTemplateItem_templateId_sortOrder_idx" ON "ChecklistTemplateItem"("templateId", "sortOrder");
CREATE UNIQUE INDEX "EmployeeChecklist_sourceKey_key" ON "EmployeeChecklist"("sourceKey");
CREATE INDEX "EmployeeChecklist_employeeId_type_createdAt_idx" ON "EmployeeChecklist"("employeeId", "type", "createdAt");
CREATE INDEX "EmployeeChecklist_status_idx" ON "EmployeeChecklist"("status");
CREATE INDEX "EmployeeChecklistItem_checklistId_sortOrder_idx" ON "EmployeeChecklistItem"("checklistId", "sortOrder");
CREATE INDEX "EmployeeChecklistItem_assignedToId_dueDate_status_idx" ON "EmployeeChecklistItem"("assignedToId", "dueDate", "status");
CREATE INDEX "EmployeeChecklistItem_dueDate_status_idx" ON "EmployeeChecklistItem"("dueDate", "status");
CREATE INDEX "Installation_workType_idx" ON "Installation"("workType");

ALTER TABLE "EmployeeQualification" ADD CONSTRAINT "EmployeeQualification_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeQualification" ADD CONSTRAINT "EmployeeQualification_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "QualificationDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeQualification" ADD CONSTRAINT "EmployeeQualification_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QualificationRequirement" ADD CONSTRAINT "QualificationRequirement_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "QualificationDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChecklistTemplateItem" ADD CONSTRAINT "ChecklistTemplateItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ChecklistTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeChecklist" ADD CONSTRAINT "EmployeeChecklist_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeChecklist" ADD CONSTRAINT "EmployeeChecklist_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ChecklistTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmployeeChecklistItem" ADD CONSTRAINT "EmployeeChecklistItem_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "EmployeeChecklist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeChecklistItem" ADD CONSTRAINT "EmployeeChecklistItem_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmployeeChecklistItem" ADD CONSTRAINT "EmployeeChecklistItem_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
