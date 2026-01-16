"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ingestionRouter = void 0;
const hono_1 = require("hono");
const zod_1 = require("zod");
const schema_1 = require("@repo/schema");
// Define the response schema for RPC typing
const IngestResponse = zod_1.z.object({
    success: zod_1.z.boolean(),
    confidence: zod_1.z.number(),
    shipment: schema_1.ShipmentSchema.optional()
});
const app = new hono_1.Hono();
// Define route with validator for RPC
const route = app.post('/', 
//   zValidator('form', z.object({
//     file: z.any() // Mocking file input for now
//   })),
async (c) => {
    // Mock Logic
    const mockShipment = {
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
        status: "draft",
        // totalCustomsValue: 12000.00 // needs to matching schema used
        // createdByUserId: "user_123"
    }; // Casting for mock simplicity against strict Prisma types
    return c.json({
        success: true,
        confidence: 0.98,
        shipment: mockShipment
    });
});
exports.ingestionRouter = route;
