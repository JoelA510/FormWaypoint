import { z } from 'zod';

/**
 * Represents a single line item within a shipment.
 * @version 1.0.0
 */
export const ShipmentLineItemV1Schema = z.object({
    id: z.string(),
    shipmentId: z.string(),

    // Product info
    sku: z.string().optional(),
    description: z.string(),
    quantity: z.number().positive(),
    uom: z.string(), // Unit of Measure (e.g. "EA", "PCS", "KG")

    // Value
    unitValue: z.number().nonnegative(),
    extendedValue: z.number().nonnegative(), // Should be quantity * unitValue

    // Weights
    netWeightKg: z.number().nonnegative(),
    grossWeightKg: z.number().nonnegative().optional(),

    // Compliance / Customs
    htsCode: z.string(), // Harmonized Tariff Schedule code
    countryOfOrigin: z.string(), // ISO country code
    eccn: z.string().optional(), // Export Control Classification Number

    // Dangerous Goods
    isDangerousGoods: z.boolean().optional(),
    dgUnNumber: z.string().optional(),
    dgHazardClass: z.string().optional(),
    dgPackingGroup: z.string().optional(),
});

export type ShipmentLineItemV1 = z.infer<typeof ShipmentLineItemV1Schema>;
