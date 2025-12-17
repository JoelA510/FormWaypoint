const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const logger = require('../../utils/logger');

class CreditRiskService {

    /**
     * Checks if a party is eligible for a credit shipment.
     * @param {string} partyId 
     * @param {number} estimatedCost 
     */
    async checkCreditLimit(partyId, estimatedCost) {
        const party = await prisma.party.findUnique({
            where: { id: partyId }
        });

        if (!party) throw new Error('Party not found');

        // If no credit limit set, assume prepaid only? Or unlimited?
        // Let's assume strict: if not set, 0.
        const limit = party.creditLimit || 0;
        const current = party.currentBalance || 0;

        if (current + estimatedCost > limit) {
            logger.warn(`Credit check failed for ${party.name}. Limit: ${limit}, Current: ${current}, Request: ${estimatedCost}`);
            return {
                approved: false,
                reason: 'Credit limit exceeded',
                shortfall: (current + estimatedCost) - limit
            };
        }

        return { approved: true };
    }

    /**
     * Updates balance after a shipment is booked/invoiced.
     */
    async addCharge(partyId, amount) {
        await prisma.party.update({
            where: { id: partyId },
            data: {
                currentBalance: { increment: amount }
            }
        });
    }

    /**
     * Refreshes credit score from external API (Mock creditsafe/D&B).
     */
    async refreshCreditRating(partyId) {
        // Mock API call
        const mockRating = Math.random() > 0.5 ? 'A' : 'B';
        const mockLimit = Math.floor(Math.random() * 50000) + 10000;

        await prisma.party.update({
            where: { id: partyId },
            data: {
                creditRating: mockRating,
                creditLimit: mockLimit
            }
        });

        return { rating: mockRating, limit: mockLimit };
    }
}

module.exports = CreditRiskService;
