const { prisma } = require('../../queue'); // Re-use prisma client from queue setup or similar
const CarrierFactory = require('../carriers/carrierFactory');

class ManifestService {
    /**
     * Create a manifest (scan form) for a carrier account.
     * @param {string} date - ISO date string (YYYY-MM-DD)
     * @param {string} carrierAccountId 
     */
    async createManifest(date, carrierAccountId) {
        // 1. Find all shipments for this account & date that aren't manifested
        const shipments = await prisma.shipment.findMany({
            where: {
                carrierAccountId: carrierAccountId,
                status: 'booked',
                manifestId: null,
                createdAt: {
                    gte: new Date(date),
                    lt: new Date(new Date(date).setDate(new Date(date).getDate() + 1))
                }
            }
        });

        if (shipments.length === 0) {
            throw new Error('No eligible shipments found for manifest');
        }

        // 2. Call Carrier Adapter
        const adapter = await CarrierFactory.getAdapter(carrierAccountId);

        // Mock Carrier Manifest Call
        // const result = await adapter.scanForm(shipments);

        // Placeholder result
        const result = {
            id: `SCAN_${Date.now()}`,
            formUrl: `https://mock-carrier.com/manifest/${Date.now()}.pdf`,
            shipmentCount: shipments.length
        };

        // 3. Create Manifest Record in DB
        const manifest = await prisma.manifest.create({
            data: {
                carrierAccountId: carrierAccountId,
                submissionId: result.id,
                documentUrl: result.formUrl,
                status: 'closed',
                closedAt: new Date()
            }
        });

        // 4. Update Shipments
        await prisma.shipment.updateMany({
            where: {
                id: { in: shipments.map(s => s.id) }
            },
            data: {
                manifestId: manifest.id
            }
        });

        return manifest;
    }
}

module.exports = new ManifestService();
