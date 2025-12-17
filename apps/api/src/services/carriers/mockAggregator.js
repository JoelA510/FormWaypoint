const BaseCarrierGateway = require('./baseCarrierGateway');
const { v4: uuidv4 } = require('uuid');

class MockAggregator extends BaseCarrierGateway {
    constructor(account) {
        super(account);
        // Default simulation settings
        this.latencyMs = 500;
        this.errorRate = 0; // 0.0 to 1.0
    }

    /**
     * Configure simulation parameters via header-based context or special credentials
     */
    configureSimulation(options) {
        if (options.latency) this.latencyMs = options.latency;
        if (options.errorRate) this.errorRate = options.errorRate;
    }

    /**
     * Generates dummy rates based on weight and destination.
     */
    async getRates(shipment, lineItems) {
        // Latency Simalation
        await new Promise(resolve => setTimeout(resolve, this.latencyMs));

        // Error Simulation (trigger via special address line 1 "ERROR_500" or similar)
        if (shipment.toAddress && shipment.toAddress.addressLine1 === 'ERROR_RATE') {
            throw new Error('Carrier API unavailable (Simulated)');
        }

        const weight = shipment.totalWeightKg || 1;
        const isIntl = shipment.destinationCountry !== shipment.originCountry;

        const rates = [
            {
                carrierCode: 'MOCK_UPS',
                serviceCode: 'GROUND',
                serviceName: 'Mock UPS Ground',
                totalCharge: (10 + weight * 0.5).toFixed(2),
                currency: 'USD',
                estimatedDays: isIntl ? 5 : 3
            },
            {
                carrierCode: 'MOCK_FEDEX',
                serviceCode: 'EXPRESS',
                serviceName: 'Mock FedEx Express',
                totalCharge: (25 + weight * 1.2).toFixed(2),
                currency: 'USD',
                estimatedDays: isIntl ? 2 : 1
            }
        ];

        return rates;
    }

    /**
     * "Books" the shipment by returning a tracking number and a fake label PDF.
     */
    async bookShipment(bookingRequest) {
        // Latency simulation
        await new Promise(resolve => setTimeout(resolve, this.latencyMs));

        const trackingNumber = `1Z${uuidv4().replace(/-/g, '').substring(0, 16).toUpperCase()}`;

        return {
            trackingNumber,
            labelData: null,
            carrierTransactionId: uuidv4(),
            status: 'success',
            publicUrl: `https://mock.formwaypoint.com/tracking/${trackingNumber}`
        };
    }

    async trackShipment(trackingNumber) {
        // Random Status Simulation
        const statuses = ['Label Created', 'In Transit', 'Out for Delivery', 'Delivered', 'Exception'];
        const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];

        return {
            status: randomStatus,
            location: 'Mock Sort Facility, KS',
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = MockAggregator;
