-- AlterTable
ALTER TABLE "User" ADD COLUMN     "employeeId" TEXT,
ADD COLUMN "email" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "CustomerProject" (
    "id" TEXT NOT NULL,
    "projectNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "installationId" TEXT,
    "quoteId" TEXT,
    "ownerUserId" TEXT,
    "title" TEXT NOT NULL,
    "workType" TEXT NOT NULL DEFAULT 'other',
    "status" TEXT NOT NULL DEFAULT 'preparation',
    "plannedDate" TEXT NOT NULL,
    "startTime" TEXT NOT NULL DEFAULT '09:00',
    "durationHours" DOUBLE PRECISION NOT NULL DEFAULT 4,
    "travelBufferMinutes" INTEGER NOT NULL DEFAULT 30,
    "internalNotes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMember" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'assistant',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectTemplate" (
    "id" TEXT NOT NULL,
    "workType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectTemplateTask" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'preparation',
    "description" TEXT NOT NULL DEFAULT '',
    "dueOffsetDays" INTEGER NOT NULL DEFAULT -7,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "operational" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProjectTemplateTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectTemplateMaterial" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL DEFAULT '',
    "unit" TEXT NOT NULL DEFAULT 'stuk',
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "supplier" TEXT NOT NULL DEFAULT '',
    "leadTimeDays" INTEGER NOT NULL DEFAULT 14,
    "safetyMarginDays" INTEGER NOT NULL DEFAULT 3,
    "neededOffsetDays" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProjectTemplateMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectTask" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'preparation',
    "description" TEXT NOT NULL DEFAULT '',
    "dueDate" TEXT NOT NULL,
    "dueOffsetDays" INTEGER NOT NULL DEFAULT -7,
    "automaticDate" BOOLEAN NOT NULL DEFAULT true,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "operational" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'open',
    "assignedEmployeeId" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMaterial" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL DEFAULT '',
    "unit" TEXT NOT NULL DEFAULT 'stuk',
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "supplier" TEXT NOT NULL DEFAULT '',
    "purchasePrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "leadTimeDays" INTEGER NOT NULL DEFAULT 14,
    "safetyMarginDays" INTEGER NOT NULL DEFAULT 3,
    "neededOnDate" TEXT NOT NULL,
    "neededOffsetDays" INTEGER NOT NULL DEFAULT 0,
    "orderByDate" TEXT NOT NULL,
    "automaticDates" BOOLEAN NOT NULL DEFAULT true,
    "expectedDeliveryDate" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'to_determine',
    "orderedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeWorkSchedule" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL DEFAULT '08:00',
    "endTime" TEXT NOT NULL DEFAULT '17:00',
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "EmployeeWorkSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeAbsence" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "startTime" TEXT NOT NULL DEFAULT '',
    "endTime" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL DEFAULT 'unavailable',
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeAbsence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectEquipment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "brand" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL DEFAULT '',
    "serialNumber" TEXT NOT NULL DEFAULT '',
    "installedAt" TEXT NOT NULL DEFAULT '',
    "warrantyUntil" TEXT NOT NULL DEFAULT '',
    "providerCode" TEXT NOT NULL DEFAULT '',
    "externalIdCipher" BYTEA,
    "externalIdIv" BYTEA,
    "externalIdTag" BYTEA,
    "keyVersion" TEXT NOT NULL DEFAULT 'v1',
    "connectionStatus" TEXT NOT NULL DEFAULT 'not_connected',
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectEquipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectAuditEvent" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectDigestRun" (
    "id" TEXT NOT NULL,
    "digestDate" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "providerId" TEXT NOT NULL DEFAULT '',
    "lastError" TEXT NOT NULL DEFAULT '',
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectDigestRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerProject_projectNumber_key" ON "CustomerProject"("projectNumber");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerProject_installationId_key" ON "CustomerProject"("installationId");

-- CreateIndex
CREATE INDEX "CustomerProject_customerId_createdAt_idx" ON "CustomerProject"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerProject_plannedDate_status_idx" ON "CustomerProject"("plannedDate", "status");

-- CreateIndex
CREATE INDEX "CustomerProject_ownerUserId_idx" ON "CustomerProject"("ownerUserId");

-- CreateIndex
CREATE INDEX "ProjectMember_employeeId_projectId_idx" ON "ProjectMember"("employeeId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMember_projectId_employeeId_key" ON "ProjectMember"("projectId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectTemplate_workType_key" ON "ProjectTemplate"("workType");

-- CreateIndex
CREATE INDEX "ProjectTemplateTask_templateId_sortOrder_idx" ON "ProjectTemplateTask"("templateId", "sortOrder");

-- CreateIndex
CREATE INDEX "ProjectTemplateMaterial_templateId_sortOrder_idx" ON "ProjectTemplateMaterial"("templateId", "sortOrder");

-- CreateIndex
CREATE INDEX "ProjectTask_projectId_dueDate_status_idx" ON "ProjectTask"("projectId", "dueDate", "status");

-- CreateIndex
CREATE INDEX "ProjectTask_assignedEmployeeId_status_idx" ON "ProjectTask"("assignedEmployeeId", "status");

-- CreateIndex
CREATE INDEX "ProjectMaterial_projectId_orderByDate_status_idx" ON "ProjectMaterial"("projectId", "orderByDate", "status");

-- CreateIndex
CREATE INDEX "ProjectMaterial_expectedDeliveryDate_status_idx" ON "ProjectMaterial"("expectedDeliveryDate", "status");

-- CreateIndex
CREATE INDEX "EmployeeWorkSchedule_weekday_active_idx" ON "EmployeeWorkSchedule"("weekday", "active");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeWorkSchedule_employeeId_weekday_key" ON "EmployeeWorkSchedule"("employeeId", "weekday");

-- CreateIndex
CREATE INDEX "EmployeeAbsence_employeeId_startDate_endDate_idx" ON "EmployeeAbsence"("employeeId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "ProjectEquipment_projectId_type_idx" ON "ProjectEquipment"("projectId", "type");

-- CreateIndex
CREATE INDEX "ProjectEquipment_providerCode_connectionStatus_idx" ON "ProjectEquipment"("providerCode", "connectionStatus");

-- CreateIndex
CREATE INDEX "ProjectAuditEvent_projectId_createdAt_idx" ON "ProjectAuditEvent"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectAuditEvent_actorId_createdAt_idx" ON "ProjectAuditEvent"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectDigestRun_status_digestDate_idx" ON "ProjectDigestRun"("status", "digestDate");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectDigestRun_digestDate_recipient_key" ON "ProjectDigestRun"("digestDate", "recipient");

-- CreateIndex
CREATE UNIQUE INDEX "User_employeeId_key" ON "User"("employeeId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerProject" ADD CONSTRAINT "CustomerProject_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerProject" ADD CONSTRAINT "CustomerProject_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "Installation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerProject" ADD CONSTRAINT "CustomerProject_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerProject" ADD CONSTRAINT "CustomerProject_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "CustomerProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTemplateTask" ADD CONSTRAINT "ProjectTemplateTask_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ProjectTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTemplateMaterial" ADD CONSTRAINT "ProjectTemplateMaterial_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ProjectTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTask" ADD CONSTRAINT "ProjectTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "CustomerProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTask" ADD CONSTRAINT "ProjectTask_assignedEmployeeId_fkey" FOREIGN KEY ("assignedEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMaterial" ADD CONSTRAINT "ProjectMaterial_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "CustomerProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeWorkSchedule" ADD CONSTRAINT "EmployeeWorkSchedule_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeAbsence" ADD CONSTRAINT "EmployeeAbsence_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectEquipment" ADD CONSTRAINT "ProjectEquipment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "CustomerProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAuditEvent" ADD CONSTRAINT "ProjectAuditEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "CustomerProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAuditEvent" ADD CONSTRAINT "ProjectAuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
