const JDEdwardsAdapter = require('../integrations/erp/JDEdwardsAdapter');
const SAPAdapter = require('../integrations/erp/SAPAdapter');

class ErpSyncService {
    constructor() {
        this.adapters = {};
        // In a real app, these would be loaded from DB/Environment
        this.config = {
            activeAdapter: 'JDE', // or 'SAP'
            jde: {
                baseUrl: process.env.JDE_BASE_URL,
                username: process.env.JDE_USERNAME
            },
            sap: {
                baseUrl: process.env.SAP_BASE_URL,
                client: '100'
            }
        };
        this.initializeAdapters();
        this.syncLogs = []; // Temporary in-memory log storage
    }

    initializeAdapters() {
        this.adapters['JDE'] = new JDEdwardsAdapter(this.config.jde);
        this.adapters['SAP'] = new SAPAdapter(this.config.sap);
    }

    /**
     * Get the currently active adapter instance
     */
    getActiveAdapter() {
        const type = this.config.activeAdapter;
        return this.adapters[type];
    }

    /**
     * Trigger a shipment sync to the ERP
     * @param {Object} shipment 
     * @returns {Promise<Object>}
     */
    async syncShipment(shipment) {
        const adapter = this.getActiveAdapter();
        const logEntry = {
            id: `LOG-${Date.now()}`,
            timestamp: new Date().toISOString(),
            shipmentId: shipment.id,
            system: this.config.activeAdapter,
            status: 'PENDING',
            details: ''
        };

        try {
            console.log(`[ErpSync] Syncing shipment ${shipment.id} to ${this.config.activeAdapter}...`);
            const result = await adapter.syncShipment(shipment);

            logEntry.status = 'SUCCESS';
            logEntry.details = JSON.stringify(result);
            this.syncLogs.unshift(logEntry);

            return result;
        } catch (error) {
            console.error('[ErpSync] Sync failed:', error);
            logEntry.status = 'ERROR';
            logEntry.details = error.message;
            this.syncLogs.unshift(logEntry);
            throw error;
        }
    }

    /**
     * Get recent sync logs
     */
    getLogs() {
        return this.syncLogs;
    }

    /**
     * Update configuration (e.g. switch adapter)
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        this.initializeAdapters();
        return this.config;
    }
}

// Singleton instance
module.exports = new ErpSyncService();
