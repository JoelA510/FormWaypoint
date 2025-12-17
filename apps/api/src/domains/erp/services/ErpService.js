const BaseService = require('../../../shared/core/BaseService');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { CreateExportConfigSchema } = require('../dtos/erpDto');

class ErpService extends BaseService {

    async createConfig(data, userId) {
        return this.execute('createConfig', async () => {
            const validated = CreateExportConfigSchema.parse(data);

            const config = await prisma.erpExportConfig.create({
                data: {
                    ...validated,
                    httpHeadersJson: validated.httpHeaders,
                    userId
                }
            });
            return config;
        });
    }

    async triggerExport(configId) {
        return this.execute('triggerExport', async () => {
            const config = await prisma.erpExportConfig.findUnique({ where: { id: configId } });
            if (!config) throw new Error('Config not found');

            // Find shipments to export (mock logic: last 24h)
            const shipments = await prisma.shipment.findMany({
                where: { updatedAt: { gte: new Date(Date.now() - 86400000) } },
                take: 50
            });

            // "Export" happen logic (Mock)
            const resultSummary = { count: shipments.length, destination: config.destination };

            await prisma.erpExportJob.create({
                data: {
                    configId,
                    status: 'SUCCESS',
                    fromDate: new Date(Date.now() - 86400000),
                    toDate: new Date(),
                    resultSummaryJson: JSON.stringify(resultSummary)
                }
            });

            return resultSummary;
        });
    }
}

module.exports = new ErpService();
