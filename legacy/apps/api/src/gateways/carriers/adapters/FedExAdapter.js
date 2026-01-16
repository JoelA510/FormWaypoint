const CarrierGateway = require('../CarrierGateway');

class FedExAdapter extends CarrierGateway {

    constructor(credentials) {
        super(credentials);
        this.apiKey = credentials.apiKey;
        this.secretKey = credentials.secretKey;
    }

    async getRates(shipment) {
        // Validation logic for FedEx-specific constraints
        if (!shipment.postage) throw new Error("FedEx requires postage info");

        // Mock API Call
        return [{
            serviceName: 'FedEx Priority Overnight',
            serviceCode: 'FEDEX_PRIORITY_OVERNIGHT',
            totalPrice: 45.00,
            currency: 'USD',
            estimatedDeliveryDate: '2025-01-02T10:30:00Z'
        }];
    }

    async createLabel(shipment) {
        return {
            trackingNumber: `123456789012`,
            labelUrl: `https://api.fedex.com/labels/123.pdf`,
            format: 'PDF',
            finalPrice: 45.00
        };
    }

    static getCredentialSchema() {
        return [
            { key: 'apiKey', label: 'API Key', type: 'text', required: true },
            { key: 'secretKey', label: 'Secret Key', type: 'password', required: true },
            { key: 'accountNumber', label: 'Account Number', type: 'text', required: true }
        ];
    }
}

module.exports = FedExAdapter;
