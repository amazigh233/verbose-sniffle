ALTER TABLE "ServiceRequest"
ADD CONSTRAINT "ServiceRequest_assignedEmployeeId_fkey"
FOREIGN KEY ("assignedEmployeeId") REFERENCES "Employee"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
