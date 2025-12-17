const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const itemService = {
    /**
     * List items with optional search and pagination
     */
    listItems: async ({ search, limit = 20, offset = 0, userId }) => {
        const where = {
            createdByUserId: userId
        };

        if (search) {
            where.OR = [
                { sku: { contains: search } },
                { description: { contains: search } },
                { htsCode: { contains: search } }
            ];
        }

        const [data, total] = await Promise.all([
            prisma.item.findMany({
                where,
                skip: offset,
                take: limit,
                orderBy: { sku: 'asc' }
            }),
            prisma.item.count({ where })
        ]);

        return { data, total, limit, offset };
    },

    /**
     * Get single item by ID
     */
    getItem: async (id, userId) => {
        const item = await prisma.item.findUnique({ where: { id } });
        if (item && item.createdByUserId !== userId) {
            return null;
        }
        return item;
    },

    /**
     * Get item by SKU
     */
    getItemBySku: async (sku, userId) => {
        const item = await prisma.item.findUnique({ where: { sku } });
        if (item && item.createdByUserId !== userId) {
            return null;
        }
        return item;
    },

    /**
     * Create new item
     */
    createItem: async (data, userId) => {
        // Check uniqueness of SKU if provided manually
        if (data.sku) {
            const existing = await prisma.item.findUnique({ where: { sku: data.sku } });
            if (existing) {
                // If it exists but belongs to someone else, we still can't duplicate SKU globally if usage is global
                // But if items are tenant-scoped, maybe SKUs should be unique per tenant?
                // Schema says SKU is @unique globally.
                // So we must check global uniqueness.
                throw new Error(`Item with SKU ${data.sku} already exists.`);
            }
        }

        return prisma.item.create({
            data: {
                ...data,
                createdByUserId: userId
            }
        });
    },

    /**
     * Update existing item
     */
    updateItem: async (id, data, userId) => {
        const item = await prisma.item.findUnique({ where: { id } });
        if (!item || item.createdByUserId !== userId) {
            throw new Error('Item not found or access denied');
        }

        return prisma.item.update({
            where: { id },
            data
        });
    },

    /**
     * Delete item
     */
    deleteItem: async (id, userId) => {
        const item = await prisma.item.findUnique({ where: { id } });
        if (!item || item.createdByUserId !== userId) {
            throw new Error('Item not found or access denied');
        }

        return prisma.item.delete({ where: { id } });
    }
};

module.exports = itemService;
