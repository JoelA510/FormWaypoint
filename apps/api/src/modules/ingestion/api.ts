import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { ShipmentSchema } from '@repo/schema'

// Define the response schema for RPC typing
const IngestResponse = z.object({
    success: z.boolean(),
    confidence: z.number(),
    shipment: ShipmentSchema.optional()
})

const app = new Hono()

// Define route with validator for RPC
const route = app.post(
    '/',
    //   zValidator('form', z.object({
    //     file: z.any() // Mocking file input for now
    //   })),
    async (c) => {
        // Mock Logic
        const mockShipment: z.infer<typeof ShipmentSchema> = {
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
        } as any; // Casting for mock simplicity against strict Prisma types

        return c.json({
            success: true,
            confidence: 0.98,
            shipment: mockShipment
        })
    })

export const ingestionRouter = route
export type IngestionRoute = typeof route
