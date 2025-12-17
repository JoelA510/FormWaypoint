const CarrierGateway = require('../CarrierGateway');

class MockAdapter extends CarrierGateway {
    async getRates(shipment) {
        return [
            { serviceName: 'Mock Express', serviceCode: 'MOCK_EXP', totalPrice: 20.00, currency: 'USD' },
            { serviceName: 'Mock Ground', serviceCode: 'MOCK_GND', totalPrice: 10.00, currency: 'USD' }
        ];
    }

    async createLabel(shipment) {
        return {
            trackingNumber: `MOCK-${Date.now()}`,
            labelUrl: 'http://localhost/mock.pdf',
            format: 'PNG',
            finalPrice: 20.00
        };
    }
}

module.exports = MockAdapter;
