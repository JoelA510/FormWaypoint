/**
 * Base class for Carrier Gateways to ensure interface compliance.
 */
class BaseCarrierGateway {
    constructor(account) {
        this.account = account;
    }

    async getRates(shipment, lineItems) {
        throw new Error('Method "getRates" not implemented');
    }

    async bookShipment(bookingRequest) {
        throw new Error('Method "bookShipment" not implemented');
    }

    async trackShipment(trackingNumber) {
        throw new Error('Method "trackShipment" not implemented');
    }

    async voidShipment(shipmentId) {
        throw new Error('Method "voidShipment" not implemented');
    }

    async validateAddress(address) {
        throw new Error('Method "validateAddress" not implemented');
    }
}

module.exports = BaseCarrierGateway;
