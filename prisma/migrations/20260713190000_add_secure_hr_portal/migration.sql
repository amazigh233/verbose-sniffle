ALTER TABLE "User"
ADD COLUMN "mfaSecretCipher" BYTEA,
ADD COLUMN "mfaSecretIv" BYTEA,
ADD COLUMN "mfaSecretTag" BYTEA,
ADD COLUMN "mfaEnabledAt" TIMESTAMP(3),
ADD COLUMN "mfaLastUsedStep" INTEGER;

CREATE TABLE "UserMfaRecoveryCode" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserMfaRecoveryCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Employee" (
  "id" TEXT NOT NULL,
  "employeeNumber" TEXT NOT NULL,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "workEmail" TEXT NOT NULL DEFAULT '',
  "workPhone" TEXT NOT NULL DEFAULT '',
  "jobTitle" TEXT NOT NULL DEFAULT '',
  "department" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'active',
  "employmentType" TEXT NOT NULL DEFAULT 'permanent',
  "hoursPerWeek" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "startDate" TEXT NOT NULL,
  "endDate" TEXT NOT NULL DEFAULT '',
  "privateDataCipher" BYTEA,
  "privateDataIv" BYTEA,
  "privateDataTag" BYTEA,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmploymentContract" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "contractType" TEXT NOT NULL DEFAULT 'permanent',
  "status" TEXT NOT NULL DEFAULT 'active',
  "startDate" TEXT NOT NULL,
  "endDate" TEXT NOT NULL DEFAULT '',
  "hoursPerWeek" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "description" TEXT NOT NULL DEFAULT '',
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL DEFAULT 'application/pdf',
  "size" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "scanStatus" TEXT NOT NULL DEFAULT 'quarantine',
  "scanMessage" TEXT NOT NULL DEFAULT '',
  "fileCipher" BYTEA NOT NULL,
  "fileIv" BYTEA NOT NULL,
  "fileTag" BYTEA NOT NULL,
  "keyVersion" TEXT NOT NULL DEFAULT 'v1',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmploymentContract_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmployeeNote" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'general',
  "bodyCipher" BYTEA NOT NULL,
  "bodyIv" BYTEA NOT NULL,
  "bodyTag" BYTEA NOT NULL,
  "keyVersion" TEXT NOT NULL DEFAULT 'v1',
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmployeeNote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HrAuditEvent" (
  "id" TEXT NOT NULL,
  "actorId" TEXT,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "metadata" JSONB,
  "ipHash" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HrAuditEvent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Installation" ADD COLUMN "employeeId" TEXT;

CREATE UNIQUE INDEX "Employee_employeeNumber_key" ON "Employee"("employeeNumber");
CREATE INDEX "UserMfaRecoveryCode_userId_usedAt_idx" ON "UserMfaRecoveryCode"("userId", "usedAt");
CREATE INDEX "Employee_status_idx" ON "Employee"("status");
CREATE INDEX "Employee_department_idx" ON "Employee"("department");
CREATE INDEX "Employee_lastName_firstName_idx" ON "Employee"("lastName", "firstName");
CREATE INDEX "Employee_endDate_idx" ON "Employee"("endDate");
CREATE INDEX "EmploymentContract_employeeId_idx" ON "EmploymentContract"("employeeId");
CREATE INDEX "EmploymentContract_endDate_idx" ON "EmploymentContract"("endDate");
CREATE INDEX "EmploymentContract_scanStatus_idx" ON "EmploymentContract"("scanStatus");
CREATE INDEX "EmployeeNote_employeeId_createdAt_idx" ON "EmployeeNote"("employeeId", "createdAt");
CREATE INDEX "HrAuditEvent_entityType_entityId_createdAt_idx" ON "HrAuditEvent"("entityType", "entityId", "createdAt");
CREATE INDEX "HrAuditEvent_actorId_createdAt_idx" ON "HrAuditEvent"("actorId", "createdAt");
CREATE INDEX "Installation_employeeId_idx" ON "Installation"("employeeId");

ALTER TABLE "UserMfaRecoveryCode" ADD CONSTRAINT "UserMfaRecoveryCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmploymentContract" ADD CONSTRAINT "EmploymentContract_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmploymentContract" ADD CONSTRAINT "EmploymentContract_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeNote" ADD CONSTRAINT "EmployeeNote_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeNote" ADD CONSTRAINT "EmployeeNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeNote" ADD CONSTRAINT "EmployeeNote_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HrAuditEvent" ADD CONSTRAINT "HrAuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Installation" ADD CONSTRAINT "Installation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
