
import { PrismaClient, Prisma } from '@repo/schema';

const prisma = new PrismaClient();

export class TemplateService {

    // --- Shipment Presets ---

    static async createTemplate(data: Prisma.ShipmentTemplateCreateInput) {
        return await prisma.shipmentTemplate.create({
            data
        });
    }

    static async getTemplate(id: string) {
        return await prisma.shipmentTemplate.findUnique({
            where: { id }
        });
    }

    static async listTemplates(userId: string) {
        return await prisma.shipmentTemplate.findMany({
            where: { userId },
            orderBy: { name: 'asc' }
        });
    }

    static async updateTemplate(id: string, data: Prisma.ShipmentTemplateUpdateInput) {
        return await prisma.shipmentTemplate.update({
            where: { id },
            data
        });
    }
}
