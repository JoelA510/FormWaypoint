const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const partyService = {
    /**
     * List parties in the address book
     * @param {Object} query - { search, limit, offset, userId }
     */
    listParties: async ({ search, limit = 20, offset = 0, userId }) => {
        const where = {
            isAddressBookEntry: true,
            createdByUserId: userId
        };

        if (search) {
            where.OR = [
                { name: { contains: search } },
                { city: { contains: search } },
                { countryCode: { contains: search } }
            ];
        }

        const [data, total] = await Promise.all([
            prisma.party.findMany({
                where,
                skip: offset,
                take: limit,
                orderBy: { name: 'asc' }
            }),
            prisma.party.count({ where })
        ]);

        return { data, total, limit, offset };
    },

    /**
     * Get a single party
     */
    getParty: async (id, userId) => {
        const party = await prisma.party.findUnique({ where: { id } });
        if (party && party.createdByUserId !== userId) {
            return null; // Or throw custom Forbidden error
        }
        return party;
    },

    /**
     * Create a new address book entry
     */
    createParty: async (data, userId) => {
        return prisma.party.create({
            data: {
                ...data,
                isAddressBookEntry: true,
                createdByUserId: userId
            }
        });
    },

    /**
     * Update an existing party
     */
    updateParty: async (id, data, userId) => {
        // Verify ownership
        const party = await prisma.party.findUnique({ where: { id } });
        if (!party || party.createdByUserId !== userId) {
            throw new Error('Party not found or access denied');
        }

        return prisma.party.update({
            where: { id },
            data
        });
    },

    /**
     * Delete (or soft delete) a party
     */
    deleteParty: async (id, userId) => {
        // Verify ownership
        const party = await prisma.party.findUnique({ where: { id } });
        if (!party || party.createdByUserId !== userId) {
            throw new Error('Party not found or access denied');
        }

        // Validation: Check if linked to any shipment
        const usedCount = await prisma.shipment.count({
            where: {
                OR: [
                    { shipperId: id },
                    { consigneeId: id },
                    { forwarderId: id },
                    { brokerId: id }
                ]
            }
        });

        if (usedCount > 0) {
            // Cannot delete used party, maybe unmark as address book?
            return prisma.party.update({
                where: { id },
                data: { isAddressBookEntry: false } // "Archive" from address book
            });
        }

        return prisma.party.delete({ where: { id } });
    }
};

module.exports = partyService;
