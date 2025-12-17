const BaseService = require('../../../shared/core/BaseService');
const prisma = require('../../../db');
const Result = require('../../../shared/core/Result');

// Mock Sanctions List (In Phase 19, this would be an external API or deeper DB)
const DENIED_PARTIES = ['Bad Guys Ltd', 'Embargoed Entity', 'Evil Corp'];

const ITN_REQUIRED_DESTINATIONS = ['CN', 'RU', 'IR', 'KP', 'SY', 'CU']; // China, Russia, etc (Example)

class ComplianceService extends BaseService {

    async determineAesRequirement(data) {
        return this.execute('determineAesRequirement', async () => {
            const { shipment } = data;

            // Logic 1: Value threshold ($2500 per Schedule B)
            // Note: In reality, it's >$2500 per Schedule B code, not per line item necessarily, but per line is a safe proxy for MVP.
            const hasHighValueLine = shipment.lineItems?.some(item => (item.valueUsd || 0) > 2500);

            // Logic 2: Destination Constraints
            const destination = shipment.destinationCountry?.toUpperCase();
            const isCanada = destination === 'CA';
            const isRestrictedDest = ITN_REQUIRED_DESTINATIONS.includes(destination);

            // Logic 3: ECCN / License Required (Mock)
            const hasLicensedGoods = shipment.lineItems?.some(item => item.eccn && item.eccn !== 'EAR99');

            let aesRequired = false;
            let reason = [];

            if (hasLicensedGoods) {
                aesRequired = true;
                reason.push('Contains Licensed Goods (ECCN)');
            } else if (isRestrictedDest) {
                aesRequired = true;
                reason.push('Restricted Destination');
            } else if (hasHighValueLine && !isCanada) {
                aesRequired = true;
                reason.push('Line values exceed $2500 and dest is not Canada');
            }

            return { aesRequired, reason };
        });
    }

    async lookupUnNumber(unNumber) {
        return this.execute('lookupUnNumber', async () => {
            // Mock DB lookup if table empty
            let dgRecord = await prisma.dgUnReference.findFirst({
                where: { unNumber: { contains: unNumber } }
            });

            if (!dgRecord) {
                // Fallback Mock Data for demo
                if (unNumber === 'UN1263') return { unNumber: 'UN1263', properShippingName: 'PAINT', hazardClass: '3', packingGroup: 'II' };
                if (unNumber === 'UN3481') return { unNumber: 'UN3481', properShippingName: 'Lithium ion batteries contained in equipment', hazardClass: '9' };
                return null;
            }

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
