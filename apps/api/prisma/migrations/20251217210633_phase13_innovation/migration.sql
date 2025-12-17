-- AlterTable
ALTER TABLE "Party" ADD COLUMN "creditLimit" REAL;
ALTER TABLE "Party" ADD COLUMN "creditRating" TEXT;
ALTER TABLE "Party" ADD COLUMN "currentBalance" REAL;

-- CreateTable
CREATE TABLE "DockAppointment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "startTime" DATETIME NOT NULL,
    "endTime" DATETIME NOT NULL,
    "doorId" TEXT NOT NULL,
    "carrierName" TEXT,
    "status" TEXT NOT NULL,
    "shipmentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DockAppointment_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SpotQuote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shipmentId" TEXT NOT NULL,
    "carrierName" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL,
    "validUntil" DATETIME,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SpotQuote_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SensorReading" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shipmentId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL,
    "temperature" REAL,
    "humidity" REAL,
    "battery" REAL,
    "location" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SensorReading_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "DockAppointment_shipmentId_key" ON "DockAppointment"("shipmentId");

-- CreateIndex
CREATE INDEX "SensorReading_shipmentId_idx" ON "SensorReading"("shipmentId");
