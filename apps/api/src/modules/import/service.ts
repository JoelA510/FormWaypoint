
import { Prisma, prisma } from '@repo/schema';
import { SemanticMapper } from './mapper';



export class ImportService {

    static async processCsv(buffer: Buffer, userId: string = 'system') {
        const content = buffer.toString('utf-8');
        const rows = this.parseCsvSimple(content);

        if (rows.length === 0) throw new Error('Empty CSV');

        const headers = Object.keys(rows[0]);
        const mapping = SemanticMapper.generateMapping(headers);

        const createdShipments = [];

        // Transactional? Maybe not for bulk import to avoid total failure, 
        // but for this implementation we'll do one-by-one or batch.
        for (const row of rows) {
            const canonical = SemanticMapper.transform(row, mapping);

            // Map Canonical to Prisma Input
            // Note: This is a simplified "Header Level" import. 
            // Real world needs Line Item grouping which is logic heavy.
            // For logic parity with legacy, we treat each row as a potential shipment 
            // OR if strictly following legacy 'mapRowsToUnknownShipment', it tried to aggregate.
            // Let's assume 1 row = 1 shipment for MVP port, or basic mapping.

            const shipmentData: Prisma.ShipmentCreateInput = {
                status: 'imported',
                incoterm: canonical.incoterm || undefined,
                currency: canonical.currency || undefined,
                originCountry: canonical.originCountry || undefined,
                destinationCountry: canonical.destinationCountry || undefined,
                trackingNumber: canonical.trackingNumber || `IMP-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                totalWeight: canonical.totalWeight ? parseFloat(canonical.totalWeight) : undefined,

                // Storing Raw Names since we don't have Party IDs
                shipperSnapshot: canonical.shipper ? { name: canonical.shipper } : Prisma.JsonNull,
                consigneeSnapshot: canonical.consignee ? { name: canonical.consignee } : Prisma.JsonNull,

                // TODO: Line items logic
            };

            const shipment = await prisma.shipment.create({
                data: shipmentData
            });
            createdShipments.push(shipment);
        }

        return {
            count: createdShipments.length,
            ids: createdShipments.map(s => s.id)
        };
    }

    // Simple CSV parser to avoid dependency for MVP
    private static parseCsvSimple(text: string): Record<string, string>[] {
        const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
        if (lines.length < 2) return [];

        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        const result = [];

        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
            const obj: Record<string, string> = {};

            // Handle mismatched lengths broadly
            headers.forEach((h, index) => {
                obj[h] = values[index] || '';
            });
            result.push(obj);
        }
        return result;
    }
}
