const logger = require('../../utils/logger');

class AddressCorrectionService {
    /**
     * Standardizes and corrects an address.
     * @param {object} address - { street1, city, state, zip, country }
     */
    async correct(address) {
        logger.info(`Validating address: ${JSON.stringify(address)}`);

        // Mock logic
        // In production, this calls EasyPost / SmartyStreets / Google Places

        const corrected = {
            ...address,
            warnings: [],
            isValid: true
        };

        // Simple rule: Zip code format
        if (address.country === 'US' && address.zip && address.zip.length === 5) {
            // Simulate adding ZIP+4
            corrected.zip = `${address.zip}-0001`;
            corrected.warnings.push('Added ZIP+4 extension.');
        }

        // Simple rule: Capitalization
        if (address.city) {
            corrected.city = address.city.toUpperCase();
        }
        if (address.state) {
            corrected.state = address.state.toUpperCase();
        }

        // Simulate "Did you mean?" logic
        if (address.street1.toLowerCase().includes('ave') && !address.street1.toLowerCase().includes('avenue')) {
            corrected.street1 = address.street1.replace(/ave/i, 'Avenue');
            corrected.warnings.push('Expanded "Ave" to "Avenue".');
        }

        return corrected;
    }
}

module.exports = AddressCorrectionService;
