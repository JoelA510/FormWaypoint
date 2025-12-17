import { z } from 'zod';

/**
 * Represents a document attached to a shipment (input or output).
 * @version 1.0.0
 */
export const ShipmentDocumentV1Schema = z.object({
    id: z.string(),
    shipmentId: z.string(),

    type: z.enum(["input", "output"]),
    format: z.enum(["pdf", "csv", "xlsx", "json"]),

    label: z.string(), // e.g., "Commercial Invoice PDF"
    storageKey: z.string(), // Path or URL to the file in storage

    createdAt: z.date(),
});

export type ShipmentDocumentV1 = z.infer<typeof ShipmentDocumentV1Schema>;
