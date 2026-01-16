import { z } from 'zod';
/**
 * Represents a single line item within a shipment.
 * @version 1.0.0
 */
export declare const ShipmentLineItemV1Schema: z.ZodObject<{
    id: z.ZodString;
    shipmentId: z.ZodString;
    sku: z.ZodOptional<z.ZodString>;
    description: z.ZodString;
    quantity: z.ZodNumber;
    uom: z.ZodString;
    unitValue: z.ZodNumber;
    extendedValue: z.ZodNumber;
    netWeightKg: z.ZodNumber;
    grossWeightKg: z.ZodOptional<z.ZodNumber>;
    htsCode: z.ZodString;
    countryOfOrigin: z.ZodString;
    eccn: z.ZodOptional<z.ZodString>;
    isDangerousGoods: z.ZodOptional<z.ZodBoolean>;
    dgUnNumber: z.ZodOptional<z.ZodString>;
    dgHazardClass: z.ZodOptional<z.ZodString>;
    dgPackingGroup: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type ShipmentLineItemV1 = z.infer<typeof ShipmentLineItemV1Schema>;
