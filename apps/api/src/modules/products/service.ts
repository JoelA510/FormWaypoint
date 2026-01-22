
import { PrismaClient, Prisma } from '@repo/schema';

const prisma = new PrismaClient();

export class ProductService {

    static async upsertProduct(data: Prisma.ProductCreateInput) {
        return await prisma.product.upsert({
            where: { sku: data.sku },
            update: data,
            create: data
        });
    }

    static async getProductBySku(sku: string) {
        return await prisma.product.findUnique({
            where: { sku }
        });
    }

    static async listProducts(search?: string, limit: number = 50) {
        const where: Prisma.ProductWhereInput = {};

        if (search) {
            where.OR = [
                { sku: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } }
            ];
        }

        return await prisma.product.findMany({
            where,
            take: limit,
            orderBy: { sku: 'asc' }
        });
    }
}
