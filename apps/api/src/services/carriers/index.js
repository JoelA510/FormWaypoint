const FedExAdapter = require('./fedex');
const UPSAdapter = require('./ups');
const { prisma } = require('../../queue');

class CarrierService {
    /**
     * Get an initialized carrier adapter
     * @param {string} provider - 'fedex' or 'ups'
     * @param {string} userId - User ID to fetch credentials
     */
    static async getAdapter(provider, userId) {
        // Fetch active account for user
        const account = await prisma.carrierAccount.findFirst({
            where: {
                userId,
                provider: provider.toLowerCase(),
                isActive: true
            }
        });

        if (!account) {
            throw new Error(`No active ${provider} account found for user`);
        }

        // Decrypt credentials here (placeholder for now)
        const credentials = JSON.parse(account.credentials);

        switch (provider.toLowerCase()) {
            case 'fedex':
                return new FedExAdapter(credentials, account.accountNumber);
            case 'ups':
                return new UPSAdapter(credentials, account.accountNumber);
            default:
                throw new Error(`Unsupported carrier: ${provider}`);
        }
    }

    // Simple in-memory cache: { hash: { rates, timestamp } }
    static rateCache = new Map();
    static CACHE_TTL = 15 * 60 * 1000; // 15 minutes

    /**
     * Generate a cache key for the shipment
     */
    static getCacheKey(shipment) {
        return JSON.stringify(shipment);
    }

    /**
     * Get all available rates from all active accounts
     * @param {string} userId 
     * @param {object} shipment 
     */
    static async shopRates(userId, shipment) {
        const cacheKey = this.getCacheKey(shipment);
        const cached = this.rateCache.get(cacheKey);

        if (cached && (Date.now() - cached.timestamp < this.CACHE_TTL)) {
            console.log('Returning cached rates');
            return cached.rates;
        }

        const accounts = await prisma.carrierAccount.findMany({
            where: { userId, isActive: true }
        });

        const ratePromises = accounts.map(async (account) => {
            try {
                const adapter = await this.getAdapter(account.provider, userId);
                const rates = await adapter.getRates(shipment);
                return rates.map(r => ({ ...r, provider: account.provider }));
            } catch (error) {
                console.error(`Error fetching rates for ${account.provider}:`, error);
                return [];
            }
        });

        const results = await Promise.all(ratePromises);
        const rates = results.flat().sort((a, b) => a.amount - b.amount);

        // Cache the results
        this.rateCache.set(cacheKey, {
            rates,
            timestamp: Date.now()
        });

        return rates;
    }
}

module.exports = CarrierService;
