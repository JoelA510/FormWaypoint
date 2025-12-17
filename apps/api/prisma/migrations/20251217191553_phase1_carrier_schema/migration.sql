-- AlterTable
ALTER TABLE "CarrierAccount" ADD COLUMN "description" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Shipment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schemaVersion" TEXT NOT NULL DEFAULT 'shipment.v1',
    "erpOrderId" TEXT,
    "erpShipmentId" TEXT,
    "shipperId" TEXT NOT NULL,
    "consigneeId" TEXT NOT NULL,
    "forwarderId" TEXT,
    "brokerId" TEXT,
    "incoterm" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "totalCustomsValue" REAL NOT NULL,
    "totalWeightKg" REAL NOT NULL,
    "numPackages" INTEGER NOT NULL,
    "originCountry" TEXT NOT NULL,
    "destinationCountry" TEXT NOT NULL,
    "carrierCode" TEXT,
    "serviceLevelCode" TEXT,
    "trackingNumber" TEXT,
    "carrierAccountId" TEXT,
    "aesRequired" BOOLEAN NOT NULL DEFAULT false,
    "aesItn" TEXT,
    "aesExemptionCode" TEXT,
    "assignedTo" TEXT,
    "dueDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "meta" TEXT,
    "shipperSnapshot" TEXT,
    "consigneeSnapshot" TEXT,
    "forwarderSnapshot" TEXT,
    "brokerSnapshot" TEXT,
    "sourceDocumentId" TEXT,
    CONSTRAINT "Shipment_shipperId_fkey" FOREIGN KEY ("shipperId") REFERENCES "Party" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Shipment_consigneeId_fkey" FOREIGN KEY ("consigneeId") REFERENCES "Party" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Shipment_forwarderId_fkey" FOREIGN KEY ("forwarderId") REFERENCES "Party" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Shipment_brokerId_fkey" FOREIGN KEY ("brokerId") REFERENCES "Party" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Shipment_carrierAccountId_fkey" FOREIGN KEY ("carrierAccountId") REFERENCES "CarrierAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Shipment_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "Document" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Shipment" ("aesExemptionCode", "aesItn", "aesRequired", "assignedTo", "brokerId", "brokerSnapshot", "carrierCode", "consigneeId", "consigneeSnapshot", "createdAt", "createdByUserId", "currency", "destinationCountry", "dueDate", "erpOrderId", "erpShipmentId", "forwarderId", "forwarderSnapshot", "id", "incoterm", "meta", "numPackages", "originCountry", "schemaVersion", "serviceLevelCode", "shipperId", "shipperSnapshot", "sourceDocumentId", "status", "totalCustomsValue", "totalWeightKg", "trackingNumber", "updatedAt") SELECT "aesExemptionCode", "aesItn", "aesRequired", "assignedTo", "brokerId", "brokerSnapshot", "carrierCode", "consigneeId", "consigneeSnapshot", "createdAt", "createdByUserId", "currency", "destinationCountry", "dueDate", "erpOrderId", "erpShipmentId", "forwarderId", "forwarderSnapshot", "id", "incoterm", "meta", "numPackages", "originCountry", "schemaVersion", "serviceLevelCode", "shipperId", "shipperSnapshot", "sourceDocumentId", "status", "totalCustomsValue", "totalWeightKg", "trackingNumber", "updatedAt" FROM "Shipment";
DROP TABLE "Shipment";
ALTER TABLE "new_Shipment" RENAME TO "Shipment";
CREATE INDEX "Shipment_sourceDocumentId_idx" ON "Shipment"("sourceDocumentId");
CREATE INDEX "Shipment_createdByUserId_idx" ON "Shipment"("createdByUserId");
CREATE INDEX "Shipment_status_idx" ON "Shipment"("status");
CREATE INDEX "Shipment_shipperId_idx" ON "Shipment"("shipperId");
CREATE INDEX "Shipment_consigneeId_idx" ON "Shipment"("consigneeId");
CREATE INDEX "Shipment_carrierAccountId_idx" ON "Shipment"("carrierAccountId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
