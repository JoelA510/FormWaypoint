
import { Shipment, Prisma, prisma } from '@repo/schema';

 // In a real app, use a singleton or DI

export class ShipmentService {
    static async createShipment(data: Prisma.ShipmentCreateInput) {
        // Mock tracking number generation from legacy logic
        const trackingNumber = `TEMP-${Date.now()}`;

        return await prisma.shipment.create({
            data: {
                ...data,
                trackingNumber
            }
        });
    }

    static async getShipment(id: string) {
        return await prisma.shipment.findUniqueOrThrow({
            where: { id },
            include: {
                shipper: true,
                consignee: true
            }
        });
    }

    static async listShipments(page: number = 1, limit: number = 20, status?: string) {
        const skip = (page - 1) * limit;
        const where: Prisma.ShipmentWhereInput = status ? { status } : {};

        const [data, total] = await prisma.$transaction([
            prisma.shipment.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    shipper: true,
                    consignee: true
                }
            }),
            prisma.shipment.count({ where })
        ]);

        return {
            data,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        };
    }
}
