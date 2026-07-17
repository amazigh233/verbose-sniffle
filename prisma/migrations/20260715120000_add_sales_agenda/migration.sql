-- CreateTable
CREATE TABLE "SalesAppointment" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'belafspraak',
    "status" TEXT NOT NULL DEFAULT 'gepland',
    "date" TEXT NOT NULL,
    "startTime" TEXT NOT NULL DEFAULT '09:00',
    "endTime" TEXT NOT NULL DEFAULT '09:30',
    "customerId" TEXT,
    "opportunityId" TEXT,
    "contactName" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesAppointment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SalesAppointment_date_startTime_idx" ON "SalesAppointment"("date", "startTime");
CREATE INDEX "SalesAppointment_customerId_idx" ON "SalesAppointment"("customerId");
CREATE INDEX "SalesAppointment_opportunityId_idx" ON "SalesAppointment"("opportunityId");
CREATE INDEX "SalesAppointment_status_idx" ON "SalesAppointment"("status");

ALTER TABLE "SalesAppointment" ADD CONSTRAINT "SalesAppointment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesAppointment" ADD CONSTRAINT "SalesAppointment_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "SalesOpportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
