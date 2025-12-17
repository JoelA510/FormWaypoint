/*
  Warnings:

  - You are about to drop the column `aesNumber` on the `Shipment` table. All the data in the column will be lost.
  - You are about to drop the column `carrier` on the `Shipment` table. All the data in the column will be lost.
  - You are about to drop the column `cost` on the `Shipment` table. All the data in the column will be lost.
  - You are about to drop the column `documentId` on the `Shipment` table. All the data in the column will be lost.
  - You are about to drop the column `labelUrl` on the `Shipment` table. All the data in the column will be lost.
  - You are about to drop the column `pickupId` on the `Shipment` table. All the data in the column will be lost.
  - You are about to drop the column `serviceType` on the `Shipment` table. All the data in the column will be lost.
  - Added the required column `consigneeId` to the `Shipment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `createdByUserId` to the `Shipment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `currency` to the `Shipment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `destinationCountry` to the `Shipment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `incoterm` to the `Shipment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `numPackages` to the `Shipment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `originCountry` to the `Shipment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `shipperId` to the `Shipment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `totalCustomsValue` to the `Shipment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `totalWeightKg` to the `Shipment` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "ShipmentLineItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shipmentId" TEXT NOT NULL,
    "sku" TEXT,
    "description" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "uom" TEXT NOT NULL,
    "unitValue" REAL NOT NULL,
    "extendedValue" REAL NOT NULL,
    "netWeightKg" REAL NOT NULL,
    "grossWeightKg" REAL,
    "htsCode" TEXT NOT NULL,
    "countryOfOrigin" TEXT NOT NULL,
    "eccn" TEXT,
    "isDangerousGoods" BOOLEAN,
    "dgUnNumber" TEXT,
    "dgHazardClass" TEXT,
    "dgPackingGroup" TEXT,
    CONSTRAINT "ShipmentLineItem_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Party" (
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
    "taxIdOrEori" TEXT
);

-- CreateTable
CREATE TABLE "ShipmentDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shipmentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShipmentDocument_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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
    "aesRequired" BOOLEAN,
    "aesItn" TEXT,
    "eeiExemptionCode" TEXT,
    "hasDangerousGoods" BOOLEAN,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "sourceDocumentId" TEXT,
    CONSTRAINT "Shipment_shipperId_fkey" FOREIGN KEY ("shipperId") REFERENCES "Party" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Shipment_consigneeId_fkey" FOREIGN KEY ("consigneeId") REFERENCES "Party" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Shipment_forwarderId_fkey" FOREIGN KEY ("forwarderId") REFERENCES "Party" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Shipment_brokerId_fkey" FOREIGN KEY ("brokerId") REFERENCES "Party" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Shipment_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "Document" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Shipment" ("createdAt", "id", "status", "trackingNumber", "updatedAt") SELECT "createdAt", "id", "status", "trackingNumber", "updatedAt" FROM "Shipment";
DROP TABLE "Shipment";
ALTER TABLE "new_Shipment" RENAME TO "Shipment";
CREATE INDEX "Shipment_sourceDocumentId_idx" ON "Shipment"("sourceDocumentId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ShipmentLineItem_shipmentId_idx" ON "ShipmentLineItem"("shipmentId");

-- CreateIndex
CREATE INDEX "ShipmentDocument_shipmentId_idx" ON "ShipmentDocument"("shipmentId");
