"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const shipment_1 = require("../shipment");
(0, vitest_1.describe)('ShipmentV1Schema', () => {
    (0, vitest_1.it)('validates a correct shipment', () => {
        const validShipment = {
            id: 'ship_123',
            schemaVersion: 'shipment.v1',
            shipper: {
                id: 'party_1',
                name: 'Shipper Inc',
                addressLine1: '123 St',
                city: 'City',
                postalCode: '12345',
                countryCode: 'US'
            },
            consignee: {
                id: 'party_2',
                name: 'Acme Corp',
                addressLine1: '123 Main St',
                city: 'Metropolis',
                postalCode: '12345',
                countryCode: 'US'
            },
            incoterm: 'DDP',
            currency: 'USD',
            totalCustomsValue: 1000,
            totalWeightKg: 50,
            numPackages: 5,
            originCountry: 'CN',
            destinationCountry: 'US',
            createdAt: new Date(),
            updatedAt: new Date(),
            createdByUserId: 'user_1'
        };
        const result = shipment_1.ShipmentV1Schema.safeParse(validShipment);
        (0, vitest_1.expect)(result.success).toBe(true);
    });
    (0, vitest_1.it)('fails on missing required compliance fields', () => {
        const invalidShipment = {
            id: 'ship_123',
            // Missing schemaVersion
            shipper: { id: 'party_1' },
            // Missing consignee entirely
            incoterm: 'DDP',
            currency: 'USD',
            totalCustomsValue: 1000,
            // Missing weights
            originCountry: 'CN',
            destinationCountry: 'US',
            createdAt: new Date(),
            updatedAt: new Date(),
            createdByUserId: 'user_1'
        };
        const result = shipment_1.ShipmentV1Schema.safeParse(invalidShipment);
        (0, vitest_1.expect)(result.success).toBe(false);
        if (!result.success) {
            const fieldErrors = result.error.flatten().fieldErrors;
            (0, vitest_1.expect)(fieldErrors.schemaVersion).toBeDefined();
            (0, vitest_1.expect)(fieldErrors.consignee).toBeDefined();
            (0, vitest_1.expect)(fieldErrors.totalWeightKg).toBeDefined();
        }
    });
    (0, vitest_1.it)('validates nested line items', () => {
        const shipmentWithLines = {
            id: 'ship_123',
            schemaVersion: 'shipment.v1',
            shipper: {
                id: 'party_1',
                name: 'Shipper Inc',
                addressLine1: '123 St',
                city: 'City',
                postalCode: '12345',
                countryCode: 'US'
            },
            consignee: {
                id: 'party_2',
                name: 'Acme Corp',
                addressLine1: '123 Main St',
                city: 'Metropolis',
                postalCode: '12345',
                countryCode: 'US'
            },
            incoterm: 'DDP',
            currency: 'USD',
            totalCustomsValue: 1000,
            totalWeightKg: 50,
            numPackages: 5,
            originCountry: 'CN',
            destinationCountry: 'US',
            createdAt: new Date(),
            updatedAt: new Date(),
            createdByUserId: 'user_1',
            lineItems: [
                {
                    id: 'line_1',
                    shipmentId: 'ship_123',
                    description: 'Widget',
                    quantity: 10,
                    uom: 'PCS',
                    unitValue: 100,
                    extendedValue: 1000,
                    netWeightKg: 5,
                    htsCode: '1234.56.7890',
                    countryOfOrigin: 'CN'
                }
            ]
        };
        const result = shipment_1.ShipmentV1Schema.safeParse(shipmentWithLines);
        if (!result.success) {
            console.error(JSON.stringify(result.error.flatten(), null, 2));
        }
        (0, vitest_1.expect)(result.success).toBe(true);
    });
});
