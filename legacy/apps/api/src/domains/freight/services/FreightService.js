const BaseService = require('../../../shared/core/BaseService');
const prisma = require('../../../db');
const { CreateForwarderProfileSchema } = require('../dtos/freightDto');

class FreightService extends BaseService {

    async createProfile(data, userId) {
        return this.execute('createProfile', async () => {
            const validated = CreateForwarderProfileSchema.parse(data);
            // Must satisfy the required fields in schema (emailBodyTemplate, attachmentTypesJson)
            // Mocking defaults for brevity if Zod doesn't catch them

            const profile = await prisma.forwarderProfile.create({
                data: {
                    ...validated,
                    emailCcJson: '[]',
                    emailBodyTemplate: 'Please find attached shipment details.',
                    attachmentTypesJson: '["PDF"]',
                    userId
                }
            });
            return profile;
        });
    }

    async generateForwarderBundle(shipmentId, profileId) {
        return this.execute('generateForwarderBundle', async () => {
            const shipment = await prisma.shipment.findUnique({ where: { id: shipmentId } });
            if (!shipment) throw new Error('Shipment not found');

            // Generate Bundle Logic (Mock)
            return {
                message: "Bundle generated and emailed (Mock)",
                shipmentId,
                profileId
            };
        });
    }
}

module.exports = new FreightService();
