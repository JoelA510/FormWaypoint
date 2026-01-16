const BaseService = require('../../../shared/core/BaseService');
const prisma = require('../../../db');
const { CreateShipmentSchema, UpdateShipmentSchema } = require('../dtos/shipmentDto');
const Result = require('../../../shared/core/Result');

class ShipmentService extends BaseService {

    async createShipment(data) {
        return this.execute('createShipment', async () => {
            // 1. Validate
            const validated = CreateShipmentSchema.parse(data);

            // 2. Business Logic (e.g. set default broker if DDP)
            // Defaulting handled by Zod or DB, but here we can add complex logic

            // 3. Persist
            const shipment = await prisma.shipment.create({
                data: {
                    ...validated,
                    trackingNumber: `TEMP-${Date.now()}` // Mock tracking gen
                }
            });

            return shipment;
        });
    }

    async getShipment(id) {
        return this.execute('getShipment', async () => {
            const shipment = await prisma.shipment.findUnique({
                where: { id },
                include: {
                    shipper: true,
                    consignee: true,
                    lineItems: true
                }
            });

            if (!shipment) throw new Error('Shipment not found');
            return shipment;
        });
    }

    async listShipments(query) {
        return this.execute('listShipments', async () => {
            const { page = 1, limit = 20, status } = query;
            const skip = (page - 1) * limit;

            const where = {};
            if (status) where.status = status;

            const [data, total] = await Promise.all([
                prisma.shipment.findMany({
                    where,
                    skip,
                    take: parseInt(limit),
                    orderBy: { createdAt: 'desc' },
                    include: { shipper: true, consignee: true }
                }),
                prisma.shipment.count({ where })
            ]);

            return {
                data,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / limit)
                }
            };
        });
    }
}

module.exports = new ShipmentService();
