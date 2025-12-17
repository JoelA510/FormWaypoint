const CarrierAdapter = require('./base');

class EasyPostAdapter extends CarrierAdapter {
    constructor(credentials) {
        super(credentials);
        this.apiKey = credentials.apiKey;
    }

    async getRates(shipment) {
        console.log('EasyPost getRates', shipment);
        // Implement EasyPost API call
        return [];
    }

    /**
     * Supports Multi-Piece Shipment (MPS)
     */
    async createShipment(shipment) {
        console.log('EasyPost createShipment', shipment.id);

        // Map packages
        const parcels = (shipment.packages && shipment.packages.length > 0)
            ? shipment.packages.map(p => ({
                weight: p.weightKg * 35.274, // kg to oz
                length: p.dimLength,
                width: p.dimWidth,
                height: p.dimHeight,
            }))
            : [{ weight: shipment.totalWeightKg * 35.274 }]; // Fallback to shipment weight

        // Mock EasyPost API Call
        const mpsResult = parcels.map((p, idx) => ({
            trackingNumber: `EP_MOCK_${shipment.id}_${idx + 1}`,
            labelUrl: `https://mock.easypost.com/label/EP_${shipment.id}_${idx + 1}.pdf`,
            cost: 10.00
        }));

        // In real API, a single Shipment ID covers all parcels, 
        // but we might get multiple labels.

        return {
            masterTrackingNumber: mpsResult[0].trackingNumber,
            parcels: mpsResult,
            labelBuffer: null, // Would fetch and merge PDF in real life
            labelUrl: mpsResult[0].labelUrl // Master label
        };
    }

    async trackShipment(trackingNumber) {
        console.log('EasyPost track', trackingNumber);
        return {
            status: 'UNKNOWN'
        };
    }

    async validateAddress(address) {
        console.log('EasyPost validate', address);
        return {
            isValid: true,
            normalizedAddress: address
        };
    }
}

module.exports = EasyPostAdapter;
