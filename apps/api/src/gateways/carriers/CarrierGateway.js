/**
 * @typedef {Object} RateQuote
 * @property {string} serviceName
 * @property {string} serviceCode
 * @property {number} totalPrice
 * @property {string} currency
 * @property {string} estimatedDeliveryDate
 */

/**
 * @typedef {Object} ShipmentLabel
 * @property {string} trackingNumber
 * @property {string} labelUrl
 * @property {string} format
 * @property {number} finalPrice
 */

/**
 * Abstract Carrier Gateway.
 * Enforces standardized inputs/outputs for all adapters.
 */
class CarrierGateway {
    constructor(credentials) {
        if (this.constructor === CarrierGateway) {
            throw new Error("Abstract class 'CarrierGateway' cannot be instantiated directly.");
        }
        this.credentials = credentials;
    }

    // --- Core Capabilities ---

    /**
     * @param {object} shipment 
     * @returns {Promise<RateQuote[]>}
     */
    async getRates(shipment) {
        throw new Error("Method 'getRates()' must be implemented.");
    }

    /**
     * @param {object} shipment 
     * @returns {Promise<ShipmentLabel>}
     */
    async createLabel(shipment) {
        throw new Error("Method 'createLabel()' must be implemented.");
    }

    /**
     * @param {string} trackingNumber 
     * @returns {Promise<object>}
     */
    async track(trackingNumber) {
        throw new Error("Method 'track()' must be implemented.");
    }

    /**
     * @param {string} date 
     * @returns {Promise<boolean>}
     */
    async schedulePickup(date) {
        throw new Error("Method 'schedulePickup()' must be implemented.");
    }

    // --- Configuration ---

    static getCredentialSchema() {
        return [];
    }
}

module.exports = CarrierGateway;
