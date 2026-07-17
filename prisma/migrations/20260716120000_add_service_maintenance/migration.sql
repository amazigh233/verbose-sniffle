CREATE TABLE "ServiceContract" (
  "id" TEXT NOT NULL, "contractNumber" TEXT NOT NULL, "customerId" TEXT NOT NULL, "equipmentId" TEXT,
  "title" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'active', "startDate" TEXT NOT NULL, "endDate" TEXT NOT NULL DEFAULT '',
  "price" DOUBLE PRECISION NOT NULL DEFAULT 0, "billingPeriod" TEXT NOT NULL DEFAULT 'yearly',
  "maintenanceFrequency" INTEGER NOT NULL DEFAULT 12, "nextMaintenanceDate" TEXT NOT NULL DEFAULT '', "notes" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServiceContract_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CustomerEquipment" (
  "id" TEXT NOT NULL, "customerId" TEXT NOT NULL, "installationId" TEXT, "type" TEXT NOT NULL, "brand" TEXT NOT NULL DEFAULT '',
  "model" TEXT NOT NULL DEFAULT '', "serialNumber" TEXT NOT NULL DEFAULT '', "installedAt" TEXT NOT NULL DEFAULT '',
  "warrantyUntil" TEXT NOT NULL DEFAULT '', "maintenanceIntervalMonths" INTEGER NOT NULL DEFAULT 12,
  "lastMaintenanceDate" TEXT NOT NULL DEFAULT '', "nextMaintenanceDate" TEXT NOT NULL DEFAULT '', "status" TEXT NOT NULL DEFAULT 'active',
  "notes" TEXT NOT NULL DEFAULT '', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerEquipment_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ServiceRequest" (
  "id" TEXT NOT NULL, "requestNumber" TEXT NOT NULL, "customerId" TEXT NOT NULL, "equipmentId" TEXT, "title" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'malfunction', "priority" TEXT NOT NULL DEFAULT 'normal', "description" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'open', "assignedEmployeeId" TEXT, "preferredDate" TEXT NOT NULL DEFAULT '', "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServiceRequest_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "MaintenanceVisit" (
  "id" TEXT NOT NULL, "visitNumber" TEXT NOT NULL, "customerId" TEXT NOT NULL, "equipmentId" TEXT, "contractId" TEXT,
  "serviceRequestId" TEXT, "assignedEmployeeId" TEXT, "invoiceId" TEXT, "type" TEXT NOT NULL DEFAULT 'maintenance',
  "status" TEXT NOT NULL DEFAULT 'scheduled', "plannedDate" TEXT NOT NULL, "startTime" TEXT NOT NULL DEFAULT '09:00',
  "durationHours" DOUBLE PRECISION NOT NULL DEFAULT 2, "workType" TEXT NOT NULL DEFAULT 'other', "qualificationCheck" JSONB,
  "diagnosis" TEXT NOT NULL DEFAULT '', "workPerformed" TEXT NOT NULL DEFAULT '', "materialsUsed" JSONB,
  "customerName" TEXT NOT NULL DEFAULT '', "customerSignature" TEXT NOT NULL DEFAULT '', "signedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3), "notes" TEXT NOT NULL DEFAULT '', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "MaintenanceVisit_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "MaintenanceMeasurement" (
  "id" TEXT NOT NULL, "visitId" TEXT NOT NULL, "name" TEXT NOT NULL, "value" DOUBLE PRECISION NOT NULL,
  "unit" TEXT NOT NULL DEFAULT '', "note" TEXT NOT NULL DEFAULT '', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MaintenanceMeasurement_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ServiceDocument" (
  "id" TEXT NOT NULL, "serviceRequestId" TEXT, "visitId" TEXT, "fileName" TEXT NOT NULL, "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL, "sha256" TEXT NOT NULL, "scanStatus" TEXT NOT NULL DEFAULT 'quarantine', "scanMessage" TEXT NOT NULL DEFAULT '',
  "content" BYTEA NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "ServiceDocument_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ServiceAuditEvent" (
  "id" TEXT NOT NULL, "actorId" TEXT, "action" TEXT NOT NULL, "entityType" TEXT NOT NULL, "entityId" TEXT NOT NULL,
  "metadata" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "ServiceAuditEvent_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ServiceReminderRun" (
  "id" TEXT NOT NULL, "contractId" TEXT NOT NULL, "reminderDate" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'pending',
  "providerId" TEXT NOT NULL DEFAULT '', "lastError" TEXT NOT NULL DEFAULT '', "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServiceReminderRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ServiceContract_contractNumber_key" ON "ServiceContract"("contractNumber");
CREATE INDEX "ServiceContract_customerId_status_idx" ON "ServiceContract"("customerId", "status");
CREATE INDEX "ServiceContract_nextMaintenanceDate_status_idx" ON "ServiceContract"("nextMaintenanceDate", "status");
CREATE INDEX "ServiceContract_equipmentId_idx" ON "ServiceContract"("equipmentId");
CREATE INDEX "CustomerEquipment_customerId_status_idx" ON "CustomerEquipment"("customerId", "status");
CREATE INDEX "CustomerEquipment_serialNumber_idx" ON "CustomerEquipment"("serialNumber");
CREATE INDEX "CustomerEquipment_nextMaintenanceDate_status_idx" ON "CustomerEquipment"("nextMaintenanceDate", "status");
CREATE INDEX "CustomerEquipment_warrantyUntil_idx" ON "CustomerEquipment"("warrantyUntil");
CREATE UNIQUE INDEX "ServiceRequest_requestNumber_key" ON "ServiceRequest"("requestNumber");
CREATE INDEX "ServiceRequest_customerId_status_idx" ON "ServiceRequest"("customerId", "status");
CREATE INDEX "ServiceRequest_assignedEmployeeId_status_idx" ON "ServiceRequest"("assignedEmployeeId", "status");
CREATE INDEX "ServiceRequest_priority_createdAt_idx" ON "ServiceRequest"("priority", "createdAt");
CREATE UNIQUE INDEX "MaintenanceVisit_visitNumber_key" ON "MaintenanceVisit"("visitNumber");
CREATE UNIQUE INDEX "MaintenanceVisit_invoiceId_key" ON "MaintenanceVisit"("invoiceId");
CREATE INDEX "MaintenanceVisit_plannedDate_status_idx" ON "MaintenanceVisit"("plannedDate", "status");
CREATE INDEX "MaintenanceVisit_assignedEmployeeId_plannedDate_idx" ON "MaintenanceVisit"("assignedEmployeeId", "plannedDate");
CREATE INDEX "MaintenanceVisit_customerId_plannedDate_idx" ON "MaintenanceVisit"("customerId", "plannedDate");
CREATE INDEX "MaintenanceVisit_equipmentId_idx" ON "MaintenanceVisit"("equipmentId");
CREATE INDEX "MaintenanceMeasurement_visitId_idx" ON "MaintenanceMeasurement"("visitId");
CREATE INDEX "ServiceDocument_serviceRequestId_idx" ON "ServiceDocument"("serviceRequestId");
CREATE INDEX "ServiceDocument_visitId_idx" ON "ServiceDocument"("visitId");
CREATE INDEX "ServiceDocument_scanStatus_idx" ON "ServiceDocument"("scanStatus");
CREATE INDEX "ServiceAuditEvent_entityType_entityId_createdAt_idx" ON "ServiceAuditEvent"("entityType", "entityId", "createdAt");
CREATE INDEX "ServiceAuditEvent_actorId_createdAt_idx" ON "ServiceAuditEvent"("actorId", "createdAt");
CREATE UNIQUE INDEX "ServiceReminderRun_contractId_reminderDate_key" ON "ServiceReminderRun"("contractId", "reminderDate");
CREATE INDEX "ServiceReminderRun_status_reminderDate_idx" ON "ServiceReminderRun"("status", "reminderDate");

ALTER TABLE "ServiceContract" ADD CONSTRAINT "ServiceContract_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ServiceContract" ADD CONSTRAINT "ServiceContract_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "CustomerEquipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerEquipment" ADD CONSTRAINT "CustomerEquipment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "CustomerEquipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MaintenanceVisit" ADD CONSTRAINT "MaintenanceVisit_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaintenanceVisit" ADD CONSTRAINT "MaintenanceVisit_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "CustomerEquipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MaintenanceVisit" ADD CONSTRAINT "MaintenanceVisit_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ServiceContract"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MaintenanceVisit" ADD CONSTRAINT "MaintenanceVisit_serviceRequestId_fkey" FOREIGN KEY ("serviceRequestId") REFERENCES "ServiceRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MaintenanceVisit" ADD CONSTRAINT "MaintenanceVisit_assignedEmployeeId_fkey" FOREIGN KEY ("assignedEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MaintenanceVisit" ADD CONSTRAINT "MaintenanceVisit_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MaintenanceMeasurement" ADD CONSTRAINT "MaintenanceMeasurement_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "MaintenanceVisit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceDocument" ADD CONSTRAINT "ServiceDocument_serviceRequestId_fkey" FOREIGN KEY ("serviceRequestId") REFERENCES "ServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceDocument" ADD CONSTRAINT "ServiceDocument_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "MaintenanceVisit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceAuditEvent" ADD CONSTRAINT "ServiceAuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ServiceReminderRun" ADD CONSTRAINT "ServiceReminderRun_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ServiceContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
