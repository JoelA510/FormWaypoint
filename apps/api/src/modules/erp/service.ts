
import { prisma } from '@repo/schema';
import { z } from 'zod';

export const CreateExportConfigSchema = z.object({
    destination: z.string(),
    httpHeaders: z.string().optional(), // JSON string
    endpointUrl: z.string().url(),
});

export class ErpService {
    async createConfig(data: z.infer<typeof CreateExportConfigSchema>, userId: string) {
        return prisma.erpExportConfig.create({
            data: {
                destination: data.destination,
                httpHeadersJson: data.httpHeaders,
                endpointUrl: data.endpointUrl,
                userId,
            },
        });
    }

    async triggerExport(configId: string) {
        const config = await prisma.erpExportConfig.findUnique({
            where: { id: configId },
        });

        if (!config) {
            throw new Error('Config not found');
        }

        // Mock logic: Find shipments updated in last 24h
        const yesterday = new Date(Date.now() - 86400000);
        const shipments = await prisma.shipment.findMany({
            where: { updatedAt: { gte: yesterday } },
            take: 50,
            select: { id: true },
        });

        const resultSummary = {
            count: shipments.length,
            destination: config.destination,
            shipmentIds: shipments.map((s) => s.id),
        };

        const job = await prisma.erpExportJob.create({
            data: {
                configId,
                status: 'SUCCESS',
                fromDate: yesterday,
                toDate: new Date(),
                resultSummaryJson: JSON.stringify(resultSummary),
            },
        });

        return { job, summary: resultSummary };
    }
}

export const erpService = new ErpService();
