/**
 * Carrier Gateway Interface / Factory
 * 
 * Provides a unified way to get a carrier instance based on account settings.
 */
const CarrierFactory = require('./carrierFactory');

/**
 * Factory to get the correct gateway implementation.
 * @param {string} carrierAccountId 
 */
async function getCarrierGateway(carrierAccountId) {
    // CarrierFactory handles lookup, decryption, and instantiation
    return await CarrierFactory.getAdapter(carrierAccountId);
}

module.exports = {
    getCarrierGateway,
    BaseCarrierGateway,
    CARRIER_PROVIDERS
};
