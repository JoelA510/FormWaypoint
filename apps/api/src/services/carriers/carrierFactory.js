const prisma = require('../../db');
const FedExAdapter = require('./fedex');
const EasyPostAdapter = require('./easyPostAdapter');
const UPSAdapter = require('./ups');

class CarrierFactory {
    /**
     * Get a carrier adapter instance for a specific account
     * @param {string} carrierAccountId 
     * @returns {Promise<import('./base')>}
     */
    static async getAdapter(carrierAccountId) {
        const account = await prisma.carrierAccount.findUnique({
            where: { id: carrierAccountId }
        });

        if (!account) {
            throw new Error(`Carrier Account ${carrierAccountId} not found`);
        }

        // Decrypt credentials if necessary (assuming stored as plain JSON or handling global decrypt helper)
        // For now parsing JSON
        let credentials = {};
        try {
            credentials = JSON.parse(account.credentials);
        } catch (e) {
            console.error('Failed to parse carrier credentials', e);
        }

        switch (account.provider.toLowerCase()) {
            case 'fedex':
                return new FedExAdapter(credentials, account.accountNumber);
            case 'easypost':
                return new EasyPostAdapter(credentials);
            case 'ups':
                return new UPSAdapter(credentials, account.accountNumber);
            default:
                throw new Error(`Provider ${account.provider} not supported`);
        }
    }

    /**
     * Get the credential schema for a provider.
     * @param {string} provider 
     */
    static getProviderSchema(provider) {
        switch (provider.toLowerCase()) {
            case 'fedex':
                return FedExAdapter.getCredentialSchema();
            case 'ups':
                return UPSAdapter.getCredentialSchema();
            case 'easypost':
                return EasyPostAdapter.getCredentialSchema();
            default:
                return [];
        }
    }

    /**
     * Validate credentials by attempting to instantiate adapter and call validation.
     * @param {string} provider 
     * @param {object} credentials 
     * @param {string} accountNumber 
     */
    static async validateCredentials(provider, credentials, accountNumber) {
        let adapter;
        switch (provider.toLowerCase()) {
            case 'fedex':
                adapter = new FedExAdapter(credentials, accountNumber);
                break;
            case 'ups':
                adapter = new UPSAdapter(credentials, accountNumber);
                break;
            case 'easypost':
                adapter = new EasyPostAdapter(credentials);
                break;
            default:
                throw new Error('Provider not supported');
        }

        // Mock validation call
        try {
            return await adapter.validateAccount(accountNumber);
        } catch (e) {
            console.error('Validation failed:', e.message);
            return false;
        }
    }
}

module.exports = CarrierFactory;
