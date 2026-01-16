import { z } from "zod";
export * from "./validation";
// Export generated Zod schemas from Prisma
// export * from "./generated/zod";

// --- Enums ---
export const ShipmentStatusEnum = z.enum(["draft", "ready_to_book", "booked", "in_transit", "exception", "closed"]);
export const DocumentStatusEnum = z.enum(["pending", "processing", "completed", "failed"]);

// --- Shared Types ---
export const PartySchema = z.object({
    id: z.string().uuid().optional(),
    name: z.string().min(1),
    addressLine1: z.string().min(1),
    addressLine2: z.string().optional().nullable(),
    city: z.string().min(1),
    stateOrProvince: z.string().optional().nullable(),
    postalCode: z.string().min(1),
    countryCode: z.string().length(2),
    contactName: z.string().optional().nullable(),
    phone: z.string().optional().nullable(),
    email: z.string().email().optional().nullable(),
    taxIdOrEori: z.string().optional().nullable(),
});
export type Party = z.infer<typeof PartySchema>;

export const LineItemSchema = z.object({
    id: z.string().uuid().optional(),
    description: z.string().min(1),
    quantity: z.number().positive(),
    uom: z.string().min(1), // Unit of Measure
    unitValue: z.number().nonnegative(),
    totalValue: z.number().nonnegative(),
    netWeightKg: z.number().nonnegative(),
    grossWeightKg: z.number().nonnegative().optional(),
    htsCode: z.string().optional(),
    countryOfOrigin: z.string().length(2).optional(),
});
export type LineItem = z.infer<typeof LineItemSchema>;

// --- Core Models ---
export const ShipmentSchema = z.object({
    id: z.string().uuid().optional(),
    shipper: PartySchema,
    consignee: PartySchema,
    forwarder: PartySchema.optional().nullable(),

    incoterm: z.string().length(3), // e.g. FOV, EXW
    currency: z.string().length(3), // USD, EUR

    originCountry: z.string().length(2),
    destinationCountry: z.string().length(2),

    totalWeightKg: z.number().nonnegative(),
    numPackages: z.number().int().nonnegative(),

    status: ShipmentStatusEnum.default("draft"),

    lineItems: z.array(LineItemSchema).optional(),

    meta: z.record(z.string(), z.unknown()).optional(),
    createdAt: z.date().optional(),
    updatedAt: z.date().optional(),
});
export type Shipment = z.infer<typeof ShipmentSchema>;

export const DocumentSchema = z.object({
    id: z.string().uuid().optional(),
    filename: z.string().min(1),
    status: DocumentStatusEnum.default("pending"),
    url: z.string().url().optional(),
    mimeType: z.string().optional(),
    sizeBytes: z.number().int().nonnegative().optional(),
    createdAt: z.date().optional(),
});
export type Document = z.infer<typeof DocumentSchema>;

// --- Ingestion API Types ---
export const IngestResponseSchema = z.object({
    success: z.boolean(),
    shipment: ShipmentSchema.optional(),
    confidence: z.number().min(0).max(1),
    errors: z.array(z.string()).optional(),
});
export type IngestResponse = z.infer<typeof IngestResponseSchema>;
