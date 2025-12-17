const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const templateService = {
    listTemplates: async ({ search, limit = 20, offset = 0 }) => {
        const where = {};
        if (search) {
            where.name = { contains: search };
        }

        const [data, total] = await Promise.all([
            prisma.shipmentTemplate.findMany({
                where,
                skip: offset,
                take: limit,
                orderBy: { name: 'asc' }
            }),
            prisma.shipmentTemplate.count({ where })
        ]);

        return { data, total, limit, offset };
    },

    getTemplate: async (id) => {
        return prisma.shipmentTemplate.findUnique({ where: { id } });
    },

    createTemplate: async (data, userId) => {
        // If lineItems is passed as array/object, stringify it
        let lineItemsStr = data.lineItems;
        if (typeof data.lineItems === 'object') {
            lineItemsStr = JSON.stringify(data.lineItems);
        }

        return prisma.shipmentTemplate.create({
            data: {
                ...data,
                lineItems: lineItemsStr,
                createdByUserId: userId
            }
        });
    },

    updateTemplate: async (id, data) => {
        let updateData = { ...data };
        if (updateData.lineItems && typeof updateData.lineItems === 'object') {
            updateData.lineItems = JSON.stringify(updateData.lineItems);
        }

        return prisma.shipmentTemplate.update({
            where: { id },
            data: updateData
        });
    },

    deleteTemplate: async (id) => {
        return prisma.shipmentTemplate.delete({ where: { id } });
    }
};

module.exports = templateService;
