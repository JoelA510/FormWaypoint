const BaseService = require('../../../shared/core/BaseService');
const prisma = require('../../../db');
const { CreateProductSchema } = require('../dtos/productDto');

class ProductService extends BaseService {

    async upsertProduct(data, userId) {
        return this.execute('upsertProduct', async () => {
            const validated = CreateProductSchema.parse(data);

            const product = await prisma.item.upsert({
                where: { sku: validated.sku },
                update: { ...validated },
                create: { ...validated, createdByUserId: userId }
            });
            return product;
        });
    }

    async resolveSku(sku) {
        return this.execute('resolveSku', async () => {
            const item = await prisma.item.findUnique({ where: { sku } });
            return item; // Returns null if not found, which is valid
        });
    }

    async listProducts(query) {
        return this.execute('listProducts', async () => {
            const { search } = query;
            const where = {};
            if (search) {
                where.OR = [
                    { sku: { contains: search } },
                    { description: { contains: search } }
                ];
            }
            return prisma.item.findMany({ where, take: 50 });
        });
    }
}

module.exports = new ProductService();
