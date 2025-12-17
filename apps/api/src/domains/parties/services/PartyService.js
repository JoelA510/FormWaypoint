const BaseService = require('../../../shared/core/BaseService');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { CreatePartySchema, UpdatePartySchema } = require('../dtos/partyDto');

class PartyService extends BaseService {

    async createParty(data, userId) {
        return this.execute('createParty', async () => {
            const validated = CreatePartySchema.parse(data);

            const party = await prisma.party.create({
                data: {
                    ...validated,
                    createdByUserId: userId
                }
            });
            return party;
        });
    }

    async getParty(id) {
        return this.execute('getParty', async () => {
            const party = await prisma.party.findUnique({ where: { id } });
            if (!party) throw new Error('Party not found');
            return party;
        });
    }

    async listAddressBook(userId, query = {}) {
        return this.execute('listAddressBook', async () => {
            const { search } = query;
            const where = {
                isAddressBookEntry: true,
                // createdByUserId: userId // Optionally restrict to user or org
            };

            if (search) {
                where.OR = [
                    { name: { contains: search } },
                    { city: { contains: search } }
                ];
            }

            return prisma.party.findMany({
                where,
                orderBy: { name: 'asc' },
                take: 50
            });
        });
    }
}

module.exports = new PartyService();
