-- CreateTable
CREATE TABLE "SanctionCheck" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityName" TEXT NOT NULL,
    "matchScore" REAL NOT NULL,
    "sourceList" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "checkedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedBy" TEXT,
    "reviewedAt" DATETIME
);

-- CreateTable
CREATE TABLE "EmissionLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shipmentId" TEXT NOT NULL,
    "distanceKm" REAL NOT NULL,
    "weightKg" REAL NOT NULL,
    "mode" TEXT NOT NULL,
    "co2eKg" REAL NOT NULL,
    "calculatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "EmissionLog_shipmentId_idx" ON "EmissionLog"("shipmentId");
