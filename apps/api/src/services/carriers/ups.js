const CarrierAdapter = require('./base');
const config = require('../../config');

class UPSAdapter extends CarrierAdapter {
    constructor(credentials, accountNumber) {
        super(credentials);
        this.accountNumber = accountNumber;
        this.baseUrl = config.carriers.upsUrl;
    }

    async getRates(shipment) {
        console.log('Fetching UPS rates for:', shipment);

        return [
            {
                serviceName: 'UPS Next Day Air',
                serviceCode: '01',
                amount: 48.25,
                currency: 'USD',
                deliveryDate: '2025-11-28T10:30:00'
            },
            {
                serviceName: 'UPS Ground',
                serviceCode: '03',
                amount: 14.50,
                currency: 'USD',
                deliveryDate: '2025-12-01T17:00:00'
            }
        ];
    }

    async createShipment(shipment) {
        console.log('Creating UPS shipment:', shipment);

        return {
            trackingNumber: '1Z9999999999999999',
            labelUrl: 'https://www.ups.com/label/dummy.gif',
            cost: 48.25,
            serviceType: shipment.serviceCode
        };
    }

    async schedulePickup(pickupRequest) {
        console.log('Scheduling UPS pickup:', pickupRequest);
        return {
            confirmationNumber: '293847293',
            status: 'scheduled'
        };
    }

    async validateAccount(accountNumber) {
        return true;
    }
}

module.exports = UPSAdapter;
