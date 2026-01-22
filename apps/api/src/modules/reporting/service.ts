
import { prisma } from '@repo/schema';

export class ReportingService {
    async getShipmentSummary(from?: string, to?: string) {
        const where: any = {};

        if (from || to) {
            where.createdAt = {};
            if (from) where.createdAt.gte = new Date(from);
            if (to) where.createdAt.lte = new Date(to);
        }

        const total = await prisma.shipment.count({ where });

        // Additional metrics could be added here
        return {
            total,
            period: { from, to },
            generatedAt: new Date(),
        };
    }
}

export const reportingService = new ReportingService();
