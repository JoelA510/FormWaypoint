const prisma = require('../../db');
const CarrierFactory = require('../carriers/carrierFactory');
const { connection: redis } = require('../redis');

class RateShoppingService {
    /**
     * Get rates for a shipment from all available carriers
     * @param {object} shipment - Prisma Shipment object (must include lineItems, addresses)
     * @returns {Promise<Array>} Sorted list of rates
     */
    async getRates(shipment) {
        const cacheKey = `rates:${shipment.id}`;
        const cached = await redis.get(cacheKey);
        if (cached) {
            return JSON.parse(cached);
        }

        // 1. Determine accounts to use
        let accounts = [];
        if (shipment.carrierAccountId) {
            const specificAccount = await prisma.carrierAccount.findUnique({
                where: { id: shipment.carrierAccountId }
            });
            if (specificAccount) accounts.push(specificAccount);
        } else {
            // Find all active accounts for user
            // Assuming shipment.createdByUserId is the owner
            accounts = await prisma.carrierAccount.findMany({
                where: {
                    userId: shipment.createdByUserId,
                    isActive: true
                }
            });
        }

        if (accounts.length === 0) {
            return [];
        }

        // 2. Fetch rates in parallel
        const ratePromises = accounts.map(async (account) => {
            try {
                const adapter = await CarrierFactory.getAdapter(account.id);
                // Convert Prisma shipment to generic format if needed, 
                // but assuming adapters handle the structure or we map it here.
                // For now passing directly.
                const rates = await adapter.getRates(shipment);

                // Tag rates with carrier metadata
                return rates.map(r => ({
                    ...r,
                    carrierId: account.id,
                    provider: account.provider,
                    carrierName: account.description || account.provider
                }));
            } catch (error) {
                console.error(`Failed to get rates from account ${account.id}:`, error.message);
                return [];
            }
        });

        const results = await Promise.all(ratePromises);
        let allRates = results.flat();

        // 3. Normalization (todo: map to standardized ServiceLevel enum)

        // 4. Sort by price (cheapest first)
        allRates.sort((a, b) => a.amount - b.amount);

        // 5. Cache (TTL 15 mins)
        if (allRates.length > 0) {
            await redis.setex(cacheKey, 900, JSON.stringify(allRates));
        }

        return allRates;
    }
}

module.exports = new RateShoppingService();
