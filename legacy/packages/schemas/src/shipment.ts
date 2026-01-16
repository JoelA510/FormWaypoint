import { z } from 'zod';
import { PartyRefSchema } from './party';
import { ShipmentLineItemV1Schema } from './lineItem';
import { ShipmentDocumentV1Schema } from './document';

/**
 * Canonical Shipment Schema V1.
 * This is the single source of truth for full shipment data throughout the system.
 * @version 1.0.0
 */
export const ShipmentV1Schema = z.object({
    id: z.string(),
    schemaVersion: z.string(), // e.g. "shipment.v1"

    // External Refs
    erpOrderId: z.string().optional(),
    erpShipmentId: z.string().optional(),

    // Parties
    shipper: PartyRefSchema,
    consignee: PartyRefSchema,
    forwarder: PartyRefSchema.optional(),
    broker: PartyRefSchema.optional(),

    // Commercial / Financial
    incoterm: z.string(), // e.g. "EXW", "DDP"
    currency: z.string(), // ISO currency code, e.g. "USD"
    totalCustomsValue: z.number().nonnegative(),

    // Weights & Packages
    totalWeightKg: z.number().nonnegative(),
    numPackages: z.number().int().positive(),

    // Routing
    originCountry: z.string(),
    destinationCountry: z.string(),
    carrierCode: z.string().optional(),
    serviceLevelCode: z.string().optional(),
    trackingNumber: z.string().optional(),

    // Compliance Flags
    aesRequired: z.boolean().optional(),
    aesItn: z.string().optional(),
    eeiExemptionCode: z.string().optional(),
    hasDangerousGoods: z.boolean().optional(),

    // Metadata
    createdAt: z.date(),
    updatedAt: z.date(),
    createdByUserId: z.string(),

    // Related Entities (optional when fetching summary, required for detail usually)
    lineItems: z.array(ShipmentLineItemV1Schema).optional(),
    documents: z.array(ShipmentDocumentV1Schema).optional(),
});

export type ShipmentV1 = z.infer<typeof ShipmentV1Schema>;
