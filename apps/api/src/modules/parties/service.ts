
import { PrismaClient, Prisma } from '@repo/schema';

const prisma = new PrismaClient();

export class PartyService {
    static async createParty(data: Prisma.PartyCreateInput) {
        return await prisma.party.create({
            data
        });
    }

    static async getParty(id: string) {
        return await prisma.party.findUniqueOrThrow({
            where: { id }
        });
    }

    static async listAddressBook(search?: string, limit: number = 50) {
        const where: Prisma.PartyWhereInput = {
            isAddressBookEntry: true
            // In a real multi-tenant app, we would restrict by userId/orgId here
        };

        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { city: { contains: search, mode: 'insensitive' } }
            ];
        }

        return await prisma.party.findMany({
            where,
            orderBy: { name: 'asc' },
            take: limit
        });
    }

    static async updateParty(id: string, data: Prisma.PartyUpdateInput) {
        return await prisma.party.update({
            where: { id },
            data
        });
    }
}
