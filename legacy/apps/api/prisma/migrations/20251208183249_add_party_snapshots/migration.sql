-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN "brokerSnapshot" TEXT;
ALTER TABLE "Shipment" ADD COLUMN "consigneeSnapshot" TEXT;
ALTER TABLE "Shipment" ADD COLUMN "forwarderSnapshot" TEXT;
ALTER TABLE "Shipment" ADD COLUMN "shipperSnapshot" TEXT;
