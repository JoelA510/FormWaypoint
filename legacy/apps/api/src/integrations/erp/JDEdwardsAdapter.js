const ERPAdapter = require('./ERPAdapter');

/**
 * JDEdwards Adapter
 * Simulates interaction with JD Edwards Orchestrator (AIS Server).
 * Uses JSON payloads for AIS Orchestrations.
 */
class JDEdwardsAdapter extends ERPAdapter {
    constructor(config) {
        super(config);
        this.baseUrl = config.baseUrl || 'https://jde-ais.example.com/jderest/v3';
        this.connected = false;
    }

    async connect() {
        console.log(`[JDE] Connecting to AIS Server at ${this.baseUrl}...`);
        // Simulate auth token retrieval
        if (!this.config.username || !this.config.password) {
            throw new Error('JDE Credentials missing');
        }
        this.connected = true;
        return true;
    }

    async syncShipment(shipment) {
        if (!this.connected) await this.connect();

        // Simulate JDE Orchestration Payload structure
        // Often involves an 'inputs' array matching the Orchestration inputs
        const orchestrationPayload = {
            orchestrationName: 'ORCH_ShipmentConfirm',
            inputs: [
                { name: 'OrderNumber', value: shipment.references?.find(r => r.type === 'PO')?.value || '000000' },
                { name: 'TrackingNumber', value: shipment.trackingNumber },
                { name: 'CarrierCode', value: shipment.carrierCode },
                { name: 'FreightCost', value: shipment.financials?.cost || 0 },
                { name: 'Weight', value: shipment.packages?.reduce((acc, p) => acc + p.weight.value, 0) || 0 }
            ]
        };

        console.log('[JDE] Invoking Orchestration:', JSON.stringify(orchestrationPayload, null, 2));

        // Mock success response
        return {
            system: 'JDE',
            transactionId: `WD-${Math.floor(Math.random() * 100000)}`, // 'WD' often prefix for WatchDog or sim
            status: 'SUCCESS',
            timestamp: new Date().toISOString()
        };
    }

    async getOrderStatus(referenceId) {
        if (!this.connected) await this.connect();
        console.log(`[JDE] Form Request: Fetching status for DOCO ${referenceId}`);

        // Mock status check
        return {
            orderNumber: referenceId,
            status: '520', // JDE Status Code (e.g. Ready to Pick)
            description: 'Committed to Ship',
            holdCode: ''
        };
    }
}

module.exports = JDEdwardsAdapter;
