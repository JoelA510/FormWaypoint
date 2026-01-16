"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ingestionRouter = void 0;
const hono_1 = require("hono");
const app = new hono_1.Hono();
app.post('/', async (c) => {
    // In a real app, we would parse multipart/form-data
    // const body = await c.req.parseBody()
    // const file = body['file']
    // Mock Response conforming to IngestResponseSchema (implied)
    return c.json({
        success: true,
        confidence: 0.98,
        shipment: {
            shipper: {
                name: "Mega Corp",
                addressLine1: "123 Industrial Pkwy",
                city: "Chicago",
                stateOrProvince: "IL",
                postalCode: "60601",
                countryCode: "US"
            },
            consignee: {
                name: "Euro Imports",
                addressLine1: "10 Downing St",
                city: "London",
                countryCode: "GB",
                postalCode: "SW1A 2AA"
            },
            originCountry: "US",
            destinationCountry: "GB",
            totalWeightKg: 500.5,
            numPackages: 24,
            incoterm: "FOB",
            currency: "USD",
            status: "draft"
        }
    });
});
exports.ingestionRouter = app;
