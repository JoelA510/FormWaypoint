/*
  Warnings:

  - You are about to drop the column `eeiExemptionCode` on the `Shipment` table. All the data in the column will be lost.
  - You are about to drop the column `hasDangerousGoods` on the `Shipment` table. All the data in the column will be lost.
  - Added the required column `updatedAt` to the `Party` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "ShipmentCarrierMeta" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shipmentId" TEXT NOT NULL,
    "carrierCode" TEXT,
    "serviceLevelCode" TEXT,
    "rateQuoteJson" TEXT,
    "bookingResponseJson" TEXT,
    "labelDocumentId" TEXT,
    "trackingNumber" TEXT,
    "bookedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ShipmentCarrierMeta_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ForwarderProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emailToJson" TEXT NOT NULL,
    "emailCcJson" TEXT NOT NULL,
    "emailSubjectTemplate" TEXT NOT NULL,
    "emailBodyTemplate" TEXT NOT NULL,
    "dataBundleFormat" TEXT NOT NULL,
    "attachmentTypesJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ForwarderProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ErpExportConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "schedule" TEXT,
    "httpMethod" TEXT,
    "httpHeadersJson" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ErpExportConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ErpExportJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "configId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "fromDate" DATETIME NOT NULL,
    "toDate" DATETIME NOT NULL,
    "filtersJson" TEXT,
    "resultSummaryJson" TEXT,
    "errorMessage" TEXT,
    "runAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ErpExportJob_configId_fkey" FOREIGN KEY ("configId") REFERENCES "ErpExportConfig" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DgUnReference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "unNumber" TEXT NOT NULL,
    "properShippingName" TEXT NOT NULL,
    "hazardClass" TEXT NOT NULL,
    "packingGroup" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SanctionsCheckResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shipmentId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "responseJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SanctionsCheckResult_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sku" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "htsCode" TEXT,
    "countryOfOrigin" TEXT,
    "eccn" TEXT,
    "defaultUnitValue" REAL,
    "defaultNetWeightKg" REAL,
    "uom" TEXT,
    "defaultIsDangerousGoods" BOOLEAN,
    "defaultDgUnNumber" TEXT,
    "defaultDgHazardClass" TEXT,
    "defaultDgPackingGroup" TEXT,
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ShipmentTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "shipperId" TEXT,
    "consigneeId" TEXT,
    "forwarderId" TEXT,
    "brokerId" TEXT,
    "incoterm" TEXT,
    "currency" TEXT,
    "originCountry" TEXT,
    "destinationCountry" TEXT,
    "lineItems" TEXT,
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "action" TEXT NOT NULL,
    "userId" TEXT,
    "documentId" TEXT,
    "shipmentId" TEXT,
    "details" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AuditLog_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AuditLog_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_AuditLog" ("action", "details", "documentId", "id", "timestamp", "userId") SELECT "action", "details", "documentId", "id", "timestamp", "userId" FROM "AuditLog";
DROP TABLE "AuditLog";
ALTER TABLE "new_AuditLog" RENAME TO "AuditLog";
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");
CREATE INDEX "AuditLog_shipmentId_idx" ON "AuditLog"("shipmentId");
CREATE INDEX "AuditLog_documentId_idx" ON "AuditLog"("documentId");
CREATE TABLE "new_Party" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "stateOrProvince" TEXT,
    "postalCode" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "contactName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "taxIdOrEori" TEXT,
    "isAddressBookEntry" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Party" ("addressLine1", "addressLine2", "city", "contactName", "countryCode", "email", "id", "name", "phone", "postalCode", "stateOrProvince", "taxIdOrEori") SELECT "addressLine1", "addressLine2", "city", "contactName", "countryCode", "email", "id", "name", "phone", "postalCode", "stateOrProvince", "taxIdOrEori" FROM "Party";
DROP TABLE "Party";
ALTER TABLE "new_Party" RENAME TO "Party";
CREATE INDEX "Party_createdByUserId_idx" ON "Party"("createdByUserId");
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
    "aesRequired" BOOLEAN NOT NULL DEFAULT false,
    "aesItn" TEXT,
    "aesExemptionCode" TEXT,
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
    CONSTRAINT "Shipment_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "Document" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Shipment" ("aesItn", "aesRequired", "brokerId", "brokerSnapshot", "carrierCode", "consigneeId", "consigneeSnapshot", "createdAt", "createdByUserId", "currency", "destinationCountry", "erpOrderId", "erpShipmentId", "forwarderId", "forwarderSnapshot", "id", "incoterm", "numPackages", "originCountry", "schemaVersion", "serviceLevelCode", "shipperId", "shipperSnapshot", "sourceDocumentId", "status", "totalCustomsValue", "totalWeightKg", "trackingNumber", "updatedAt") SELECT "aesItn", coalesce("aesRequired", false) AS "aesRequired", "brokerId", "brokerSnapshot", "carrierCode", "consigneeId", "consigneeSnapshot", "createdAt", "createdByUserId", "currency", "destinationCountry", "erpOrderId", "erpShipmentId", "forwarderId", "forwarderSnapshot", "id", "incoterm", "numPackages", "originCountry", "schemaVersion", "serviceLevelCode", "shipperId", "shipperSnapshot", "sourceDocumentId", "status", "totalCustomsValue", "totalWeightKg", "trackingNumber", "updatedAt" FROM "Shipment";
DROP TABLE "Shipment";
ALTER TABLE "new_Shipment" RENAME TO "Shipment";
CREATE INDEX "Shipment_sourceDocumentId_idx" ON "Shipment"("sourceDocumentId");
CREATE INDEX "Shipment_createdByUserId_idx" ON "Shipment"("createdByUserId");
CREATE INDEX "Shipment_status_idx" ON "Shipment"("status");
CREATE INDEX "Shipment_shipperId_idx" ON "Shipment"("shipperId");
CREATE INDEX "Shipment_consigneeId_idx" ON "Shipment"("consigneeId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ShipmentCarrierMeta_shipmentId_key" ON "ShipmentCarrierMeta"("shipmentId");

-- CreateIndex
CREATE INDEX "ForwarderProfile_userId_idx" ON "ForwarderProfile"("userId");

-- CreateIndex
CREATE INDEX "ErpExportConfig_userId_idx" ON "ErpExportConfig"("userId");

-- CreateIndex
CREATE INDEX "ErpExportJob_configId_idx" ON "ErpExportJob"("configId");

-- CreateIndex
CREATE INDEX "DgUnReference_unNumber_idx" ON "DgUnReference"("unNumber");

-- CreateIndex
CREATE INDEX "SanctionsCheckResult_shipmentId_idx" ON "SanctionsCheckResult"("shipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Item_sku_key" ON "Item"("sku");

-- CreateIndex
CREATE INDEX "Item_createdByUserId_idx" ON "Item"("createdByUserId");

-- CreateIndex
CREATE INDEX "ShipmentTemplate_createdByUserId_idx" ON "ShipmentTemplate"("createdByUserId");

-- CreateIndex
CREATE INDEX "Comment_userId_idx" ON "Comment"("userId");

-- CreateIndex
CREATE INDEX "Comment_documentId_idx" ON "Comment"("documentId");
