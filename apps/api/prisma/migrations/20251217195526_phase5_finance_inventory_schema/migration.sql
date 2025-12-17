-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "currencyFrom" TEXT NOT NULL,
    "currencyTo" TEXT NOT NULL,
    "rate" REAL NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "MaintenanceEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vehicleId" TEXT,
    "itemId" TEXT,
    "type" TEXT NOT NULL,
    "cost" REAL NOT NULL,
    "odometer" INTEGER,
    "notes" TEXT,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MaintenanceEvent_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "MaintenanceEvent_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Item" (
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
    "quantityOnHand" INTEGER NOT NULL DEFAULT 0,
    "binLocation" TEXT,
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Item" ("countryOfOrigin", "createdAt", "createdByUserId", "defaultDgHazardClass", "defaultDgPackingGroup", "defaultDgUnNumber", "defaultIsDangerousGoods", "defaultNetWeightKg", "defaultUnitValue", "description", "eccn", "htsCode", "id", "sku", "uom", "updatedAt") SELECT "countryOfOrigin", "createdAt", "createdByUserId", "defaultDgHazardClass", "defaultDgPackingGroup", "defaultDgUnNumber", "defaultIsDangerousGoods", "defaultNetWeightKg", "defaultUnitValue", "description", "eccn", "htsCode", "id", "sku", "uom", "updatedAt" FROM "Item";
DROP TABLE "Item";
ALTER TABLE "new_Item" RENAME TO "Item";
CREATE UNIQUE INDEX "Item_sku_key" ON "Item"("sku");
CREATE INDEX "Item_createdByUserId_idx" ON "Item"("createdByUserId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeRate_currencyFrom_currencyTo_date_key" ON "ExchangeRate"("currencyFrom", "currencyTo", "date");
