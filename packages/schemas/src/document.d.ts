import { z } from 'zod';
/**
 * Represents a document attached to a shipment (input or output).
 * @version 1.0.0
 */
export declare const ShipmentDocumentV1Schema: z.ZodObject<{
    id: z.ZodString;
    shipmentId: z.ZodString;
    type: z.ZodEnum<{
        output: "output";
        input: "input";
    }>;
    format: z.ZodEnum<{
        pdf: "pdf";
        csv: "csv";
        xlsx: "xlsx";
        json: "json";
    }>;
    label: z.ZodString;
    storageKey: z.ZodString;
    createdAt: z.ZodDate;
}, z.core.$strip>;
export type ShipmentDocumentV1 = z.infer<typeof ShipmentDocumentV1Schema>;
