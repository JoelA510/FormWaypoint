const BaseService = require('../../../shared/core/BaseService');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const Result = require('../../../shared/core/Result');

// Mock Sanctions List (Move to DB in Phase 19)
const DENIED_PARTIES = ['Bad Guys Ltd', 'Embargoed Entity', 'Evil Corp'];

class ComplianceService extends BaseService {

    async determineAesRequirement(data) {
        return this.execute('determineAesRequirement', async () => {
            const { shipment } = data;

            // Phase 19: Replace with RuleEngine
            // Rule 1: Value > $2500
            const totalValue = shipment.lineItems?.reduce((sum, item) => sum + (item.valueUsd || 0), 0) || 0;
            // Rule 2: Destination
            const isCanada = shipment.destinationCountry?.toUpperCase() === 'CA';
            const isHighValue = totalValue > 2500;

            return { aesRequired: isHighValue && !isCanada };
        });
    }

    async lookupUnNumber(unNumber) {
        return this.execute('lookupUnNumber', async () => {
            const dgRecord = await prisma.dgUnReference.findFirst({
                where: { unNumber: { contains: unNumber } }
            });
            return dgRecord;
        });
    }

    async screenParties(shipmentId) {
        return this.execute('screenParties', async () => {
            const shipment = await prisma.shipment.findUnique({
                where: { id: shipmentId },
                include: { shipper: true, consignee: true, forwarder: true }
            });
            if (!shipment) throw new Error('Shipment not found');

            const parties = [shipment.shipper, shipment.consignee, shipment.forwarder].filter(Boolean);
            const results = parties.map(p => {
                const isMatch = DENIED_PARTIES.some(dp => p.name.toLowerCase().includes(dp.toLowerCase()));
                return {
                    partyId: p.id,
                    name: p.name,
                    status: isMatch ? 'MATCH' : 'CLEAR',
                    details: isMatch ? 'Potentially matches denied party list' : null
                };
            });

            const status = results.some(r => r.status === 'MATCH') ? 'MATCH' : 'CLEAR';

            // Log result (Audit)
            await prisma.sanctionsCheckResult.create({
                data: {
                    shipmentId,
                    status,
                    responseJson: JSON.stringify(results)
                }
            });

            return { status, results };
        });
    }
}

module.exports = new ComplianceService();
