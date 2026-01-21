const prisma = require('../../db');
const FedExAdapter = require('./adapters/FedExAdapter');
const { decryptSecret } = require('../../utils/encryption');
// const UPSAdapter = require('./adapters/UPSAdapter');

class CarrierFactory {

    /**
     * @param {string} carrierAccountId 
     * @returns {Promise<import('./CarrierGateway')>}
     */
    static async getGateway(carrierAccountId) {
        if (carrierAccountId === 'mock') {
            const MockAdapter = require('./adapters/MockAdapter');
            return new MockAdapter({});
        }

        const account = await prisma.carrierAccount.findUnique({
            where: { id: carrierAccountId }
        });

        if (!account) throw new Error(`Carrier Account ${carrierAccountId} not found`);

        const decryptedCredentials = decryptSecret(account.credentials || '{}');
        const credentials = JSON.parse(decryptedCredentials || '{}');

        switch (account.provider.toLowerCase()) {
            case 'fedex':
                return new FedExAdapter(credentials);
            default:
                throw new Error(`Provider ${account.provider} not supported`);
        }
    }

    static getProviderSchema(provider) {
        switch (provider.toLowerCase()) {
            case 'fedex': return FedExAdapter.getCredentialSchema();
            default: return [];
        }
    }
}

module.exports = CarrierFactory;
