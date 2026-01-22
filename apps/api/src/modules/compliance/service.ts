
import { PrismaClient, Prisma, Shipment, Party } from '@repo/schema';

const prisma = new PrismaClient();

// Mock Denied Parties (In real world, this would be an external API or vector search)
const DENIED_PARTIES = ['Bad Guys Ltd', 'Embargoed Entity', 'Evil Corp'];
const ITN_REQUIRED_DESTINATIONS = ['CN', 'RU', 'IR', 'KP', 'SY', 'CU'];

export class ComplianceService {

    // --- AES Determination ---

    static async determineAesRequirement(shipmentId: string) {
        const shipment = await prisma.shipment.findUniqueOrThrow({
            where: { id: shipmentId },
            include: { lineItems: true } // Need value
        });

        // Loop over line items to find value > $2500
        // Legacy logic: if any line > 2500, AES required unless exemption.
        const hasHighValueLine = shipment.lineItems.some(item => {
            // item.extendedValue or unitValue * quantity
            // Assuming totalValue on line item or we calculate it. 
            // Schema has `extendedValue` on LineItem? Let's check or assume unitValue * quantity
            // Legacy code used `valueUsd`. Our schema has `unitValue` (Decimal).
            const val = Number(item.unitValue || 0) * (item.quantity || 1);
            return val > 2500;
        });

        const destination = shipment.destinationCountry?.toUpperCase();
        const isCanada = destination === 'CA';
        const isRestrictedDest = ITN_REQUIRED_DESTINATIONS.includes(destination || '');

        let aesRequired = false;
        const reasons: string[] = [];

        if (isRestrictedDest) {
            aesRequired = true;
            reasons.push('Restricted Destination');
        } else if (hasHighValueLine && !isCanada) {
            aesRequired = true;
            reasons.push('Line value exceeds $2500 and dest is not Canada');
        }

        return { aesRequired, reasons };
    }

    // --- Sanctions Screening ---

    static async screenShipmentParties(shipmentId: string) {
        const shipment = await prisma.shipment.findUniqueOrThrow({
            where: { id: shipmentId },
            include: { shipper: true, consignee: true }
        });

        const parties = [shipment.shipper, shipment.consignee].filter(Boolean) as Party[];

        const results = parties.map(p => {
            const isMatch = DENIED_PARTIES.some(dp => p.name.toLowerCase().includes(dp.toLowerCase()));
            return {
                partyId: p.id,
                name: p.name,
                status: isMatch ? 'MATCH' : 'CLEAR',
                details: isMatch ? 'Potential Denial' : null
            };
        });

        const status = results.some(r => r.status === 'MATCH') ? 'MATCH' : 'CLEAR';

        // Audit Log
        await prisma.sanctionsCheckResult.create({
            data: {
                shipmentId,
                status,
                responseJson: JSON.stringify(results)
            }
        });

        return { status, results };
    }

    static async screenAdHoc(name: string, country?: string) {
        const matchesName = DENIED_PARTIES.some(dp => name.toLowerCase().includes(dp.toLowerCase()));
        const matchesCountry = ITN_REQUIRED_DESTINATIONS.includes(country?.toUpperCase() || '');

        const hits = [];
        if (matchesName) hits.push({ reason: 'Name Match', entity: name });
        if (matchesCountry) hits.push({ reason: 'Embargoed Country', entity: country });

        return {
            status: hits.length > 0 ? 'DENIED' : 'CLEAN',
            hits,
            screenedAt: new Date()
        };
    }

    // --- DG Lookup ---

    static async lookupUnNumber(unNumber: string) {
        // Mock DB
        if (unNumber === 'UN1263') return { unNumber: 'UN1263', name: 'PAINT', class: '3' };
        if (unNumber === 'UN3481') return { unNumber: 'UN3481', name: 'Lithium Ion Batteries', class: '9' };
        return null;
    }
}
