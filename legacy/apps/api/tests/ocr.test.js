const { mapOcrToShipment } = require('../src/services/import/ocrMapper');
const {
    DEFAULT_CURRENCY,
    DEFAULT_INCOTERM,
    DEFAULT_ORIGIN_COUNTRY
} = require('../src/config/shippingDefaults');

describe('OCR Mapper', () => {
    const validOcrResult = {
        header: {
            incoterm: 'DDP',
            currency: 'EUR',
            shipper: 'Acme Corp',
            consignee: 'Beta Ltd',
            reference: 'PO-123'
        },
        lines: [
            {
                description: 'Widget A',
                quantity: 10,
                valueUsd: 100, // Total value
                netWeightKg: 5,
                countryOfOrigin: 'DE'
            }
        ],
        checksums: {
            valueUsd: 100,
            netWeightKg: 5,
            quantity: 10
        }
    };

    it('should map valid input to schema-conforming object', () => {
        const result = mapOcrToShipment(validOcrResult);

        expect(result).toBeDefined();
        // Check schema fields
        expect(result.schemaVersion).toBe('shipment.v1');
        expect(result.incoterm).toBe('DDP');
        expect(result.currency).toBe('EUR');

        // Check computed/defaulted fields
        expect(result.shipper.name).toBe('Acme Corp');
        expect(result.shipper.countryCode).toBe(DEFAULT_ORIGIN_COUNTRY); // Default because input didn't specify shipper country in header

        // Check line items
        expect(result.lineItems).toHaveLength(1);
        expect(result.lineItems[0].extendedValue).toBe(100);
        expect(result.lineItems[0].unitValue).toBe(10); // 100 / 10
    });

    it('should apply defaults for missing fields', () => {
        const minimalInput = {
            header: {}, // Empty header
            lines: []
        };

        const result = mapOcrToShipment(minimalInput);

        expect(result.incoterm).toBe(DEFAULT_INCOTERM);
        expect(result.currency).toBe(DEFAULT_CURRENCY);
        expect(result.shipper.name).toBe('Unknown Shipper');
        expect(result.shipper.addressLine1).toBe('Unknown Address');
        expect(result.totalWeightKg).toBe(0);
    });

    it('should generate valid IDs for new entities', () => {
        const result = mapOcrToShipment(validOcrResult);
        expect(result.id).toBeDefined();
        expect(result.shipper.id).toBeDefined();
        expect(result.lineItems[0].id).toBeDefined();
    });

    it('should throw if input is fatally invalid (missing header)', () => {
        expect(() => mapOcrToShipment(null)).toThrow('Invalid OCR result');
        expect(() => mapOcrToShipment({})).toThrow('Invalid OCR result');
    });
});
