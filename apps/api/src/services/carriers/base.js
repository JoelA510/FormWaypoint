/**
 * Base Carrier Adapter Interface
 * All carrier implementations must extend this class
 */
class CarrierAdapter {
    constructor(credentials) {
        this.credentials = credentials;
    }

    /**
     * Get rate quotes for a shipment
     * @param {object} shipment - Shipment details (from/to/package)
     * @returns {Promise<Array>} List of rates
     */
    async getRates(shipment) {
        throw new Error('getRates not implemented');
    }

    /**
     * Create a shipment and generate label
     * @param {object} shipment - Shipment details
     * @returns {Promise<object>} Label details (tracking number, url, cost)
     */
    async createShipment(shipment) {
        throw new Error('createShipment not implemented');
    }

    /**
     * Alias for createShipment to match common terminology
     */
    async createLabel(shipment) {
        return this.createShipment(shipment);
    }

    /**
     * Schedule a pickup
     * @param {object} pickupRequest - Pickup details
     * @returns {Promise<object>} Confirmation details
     */
    async schedulePickup(pickupRequest) {
        throw new Error('schedulePickup not implemented');
    }

    /**
     * Validate a payor account number
     * @param {string} accountNumber 
     * @returns {Promise<boolean>}
     */
    async validateAccount(accountNumber) {
        throw new Error('validateAccount not implemented');
    }

    /**
     * Cancel a shipment
     * @param {string} trackingNumber 
     * @returns {Promise<boolean>}
     */
    async cancelShipment(trackingNumber) {
        throw new Error('cancelShipment not implemented');
    }

    /**
     * Alias for cancelShipment
     */
    async voidShipment(trackingNumber) {
        return this.cancelShipment(trackingNumber);
    }

    /**
     * Track a shipment
     * @param {string} trackingNumber 
     */
    async trackShipment(trackingNumber) {
        throw new Error('trackShipment not implemented');
    }

    /**
     * Validate an address
     * @param {object} address 
     */
    async validateAddress(address) {
        throw new Error('validateAddress not implemented');
    }

    /**
     * Get the JSON schema for credentials required by this carrier.
     * Used by the frontend to render the connection form.
     */
    static getCredentialSchema() {
        return [];
    }
}

module.exports = CarrierAdapter;
