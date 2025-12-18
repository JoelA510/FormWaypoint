/**
 * Abstract Base Class for ERP Adapters
 * Defines the contract for interacting with external ERP systems (JDE, SAP, etc.)
 */
class ERPAdapter {
    constructor(config) {
        if (this.constructor === ERPAdapter) {
            throw new Error("Cannot instantiate abstract class ERPAdapter directly.");
        }
        this.config = config;
    }

    /**
     * Authenticate with the ERP system.
     * @returns {Promise<boolean>}
     */
    async connect() {
        throw new Error("Method 'connect()' must be implemented.");
    }

    /**
     * Send shipment data to the ERP (Write-Back).
     * @param {Object} shipment - The shipment object to sync.
     * @returns {Promise<Object>} - The ERP response / transaction ID.
     */
    async syncShipment(shipment) {
        throw new Error("Method 'syncShipment()' must be implemented.");
    }

    /**
     * Check the status of a specific transaction or order.
     * @param {string} referenceId - The ERP order ID / PO number.
     * @returns {Promise<Object>}
     */
    async getOrderStatus(referenceId) {
        throw new Error("Method 'getOrderStatus()' must be implemented.");
    }

    /**
     * Validate connectivity and configuration.
     * @returns {Promise<Object>} - { success: boolean, message: string }
     */
    async healthCheck() {
        try {
            await this.connect();
            return { success: true, message: 'Connected successfully' };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }
}

module.exports = ERPAdapter;
