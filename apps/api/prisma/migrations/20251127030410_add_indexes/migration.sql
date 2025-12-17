-- CreateIndex
CREATE INDEX "CarrierAccount_userId_idx" ON "CarrierAccount"("userId");

-- CreateIndex
CREATE INDEX "DocumentTemplate_userId_idx" ON "DocumentTemplate"("userId");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "Shipment_documentId_idx" ON "Shipment"("documentId");
