const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Service to build canonical Shipment Completion Exports.
 */
class ExportBuilder {

    /**
     * Builds an array of export objects for shipments in a date range.
     * @param {Date} fromDate 
     * @param {Date} toDate 
     */
    async buildShipmentExports(fromDate, toDate) {
        // Fetch completed bookings in range
        const shipments = await prisma.shipment.findMany({
            where: {
                status: 'booked', // Or whatever "completed" state means for ERP
                updatedAt: {
                    gte: fromDate,
                    lte: toDate
                }
            },
            include: {
                shipmentCarrierMeta: true,
                lineItems: true
            }
        });

        // Transform to canonical shape
        return shipments.map(s => this.toCanonical(s));
    }

    /**
     * Maps internal Shipment model to ShipmentCompletionExportV1 canonical shape.
     * @param {object} shipment 
     */
    toCanonical(shipment) {
        // Calculate totals
        const totalFreightCharge = 0; // Placeholder: Retrieve from meta or quote if available

        // Documents: In real app, we would query `Document` table for this shipment
        const documents = [];

        return {
            shipmentId: shipment.id,
            erpOrderId: shipment.orderNumber || '', // Assuming mapped
            erpShipmentId: shipment.referenceNumber || '',
            shipDate: shipment.shipDate ? shipment.shipDate.toISOString() : null,
            carrierCode: shipment.carrierCode || '',
            serviceLevelCode: shipment.serviceLevelCode || '',
            trackingNumber: shipment.trackingNumber || '',
            totalFreightCharge: totalFreightCharge,
            currency: 'USD', // Default for now
            destinationCountry: shipment.destinationCountry || '',
            documents: documents,
            exportedAt: new Date().toISOString()
        };
    }
}

module.exports = new ExportBuilder();
