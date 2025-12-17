const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { validateShipment } = require('../validation/engine');

const reportService = {
    /**
     * Get shipment summary statistics
     * @param {Object} options - { from, to } dates
     */
    getShipmentSummary: async ({ from, to }) => {
        const where = {};
        if (from || to) {
            where.createdAt = {};
            if (from) where.createdAt.gte = new Date(from);
            if (to) where.createdAt.lte = new Date(to);
        }

        // 1. Total Shipments
        const total = await prisma.shipment.count({ where });

        // 2. By Destination (Top 5)
        // Prisma groupBy is supported
        const byDestination = await prisma.shipment.groupBy({
            by: ['destinationCountry'],
            where,
            _count: {
                destinationCountry: true
            },
            orderBy: {
                _count: {
                    destinationCountry: 'desc'
                }
            },
            take: 5
        });

        // 3. By Carrier
        // Note: carrierCode might be null
        const byCarrier = await prisma.shipment.groupBy({
            by: ['carrierCode'],
            where,
            _count: {
                carrierCode: true
            },
            orderBy: {
                _count: {
                    carrierCode: 'desc'
                }
            }
        });

        // 4. By Document Type
        // This requires joining or querying ShipmentDocument
        // We filter documents by the shipments in range
        const byDocType = await prisma.shipmentDocument.groupBy({
            by: ['type'],
            where: {
                shipment: where // nested filter
            },
            _count: {
                type: true
            }
        });

        return {
            total,
            byDestination: byDestination.map(d => ({ country: d.destinationCountry, count: d._count.destinationCountry })),
            byCarrier: byCarrier.map(c => ({ carrier: c.carrierCode || 'Unassigned', count: c._count.carrierCode })),
            byDocType: byDocType.map(d => ({ type: d.type, count: d._count.type }))
        };
    },

    /**
     * Get validation summary
     * Note: This is expensive as it needs to run validation on shipments.
     * We will limit this to the last 50 shipments to ensure performance in this simple implementation.
     */
    getValidationSummary: async ({ from, to }) => {
        const where = {};
        if (from || to) {
            where.createdAt = {};
            if (from) where.createdAt.gte = new Date(from);
            if (to) where.createdAt.lte = new Date(to);
        }

        // Determine sample
        const shipments = await prisma.shipment.findMany({
            where,
            take: 50, // Limit sample size
            orderBy: { createdAt: 'desc' },
            include: { lineItems: true } // Needed for validation
        });

        const issueCounts = {};
        let dismissedCount = 0;

        for (const shipment of shipments) {
            const result = await validateShipment(shipment, shipment.lineItems || []);

            const meta = shipment.meta ? JSON.parse(shipment.meta) : {};
            const dismissedCodes = meta.dismissedValidationCodes || [];

            // Count dismissed
            dismissedCount += dismissedCodes.length;

            // Count active issues
            for (const issue of result.issues) {
                // Only count if NOT dismissed (active issues)
                if (!dismissedCodes.includes(issue.code)) {
                    const key = issue.code || 'unknown';
                    if (!issueCounts[key]) {
                        issueCounts[key] = { code: key, count: 0, distinctShipments: new Set() };
                    }
                    issueCounts[key].count++;
                    issueCounts[key].distinctShipments.add(shipment.id);
                }
            }
        }

        // Format issues
        const issues = Object.values(issueCounts)
            .map(i => ({
                code: i.code,
                count: i.count,
                affectedShipments: i.distinctShipments.size
            }))
            .sort((a, b) => b.count - a.count);

        return {
            scannedCount: shipments.length,
            activeIssues: issues,
            totalDismissedOverrides: dismissedCount
        };
    },

    /**
     * Get overrides report
     */
    getOverrides: async ({ from, to }) => {
        // We need to find shipments that HAVE meta/dismissed codes
        // Queries on JSON fields in SQLite/Prisma are limited, so we fetch and filter
        const where = {};
        if (from || to) {
            where.createdAt = {};
            if (from) where.createdAt.gte = new Date(from);
            if (to) where.createdAt.lte = new Date(to);
        }

        // Fetch all (or paginated) and filter in memory for overrides
        // Given "lightweight", we'll fetch recent 100
        const shipments = await prisma.shipment.findMany({
            where,
            take: 100,
            orderBy: { createdAt: 'desc' },
            select: { id: true, erpOrderId: true, meta: true, updatedAt: true }
        });

        const overrides = [];

        for (const s of shipments) {
            if (s.meta) {
                try {
                    const meta = JSON.parse(s.meta);
                    if (meta.dismissedValidationCodes && meta.dismissedValidationCodes.length > 0) {
                        overrides.push({
                            shipmentId: s.id,
                            erpOrderId: s.erpOrderId,
                            dismissedCodes: meta.dismissedValidationCodes,
                            updatedAt: s.updatedAt
                        });
                    }
                } catch (e) {
                    // ignore parse errors
                }
            }
        }

        return overrides;
    }
};

module.exports = reportService;
