"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShipmentV1Schema = void 0;
const zod_1 = require("zod");
const party_1 = require("./party");
const lineItem_1 = require("./lineItem");
const document_1 = require("./document");
/**
 * Canonical Shipment Schema V1.
 * This is the single source of truth for full shipment data throughout the system.
 * @version 1.0.0
 */
exports.ShipmentV1Schema = zod_1.z.object({
    id: zod_1.z.string(),
    schemaVersion: zod_1.z.string(), // e.g. "shipment.v1"
    // External Refs
    erpOrderId: zod_1.z.string().optional(),
    erpShipmentId: zod_1.z.string().optional(),
    // Parties
    shipper: party_1.PartyRefSchema,
    consignee: party_1.PartyRefSchema,
    forwarder: party_1.PartyRefSchema.optional(),
    broker: party_1.PartyRefSchema.optional(),
    // Commercial / Financial
    incoterm: zod_1.z.string(), // e.g. "EXW", "DDP"
    currency: zod_1.z.string(), // ISO currency code, e.g. "USD"
    totalCustomsValue: zod_1.z.number().nonnegative(),
    // Weights & Packages
    totalWeightKg: zod_1.z.number().nonnegative(),
    numPackages: zod_1.z.number().int().positive(),
    // Routing
    originCountry: zod_1.z.string(),
    destinationCountry: zod_1.z.string(),
    carrierCode: zod_1.z.string().optional(),
    serviceLevelCode: zod_1.z.string().optional(),
    trackingNumber: zod_1.z.string().optional(),
    // Compliance Flags
    aesRequired: zod_1.z.boolean().optional(),
    aesItn: zod_1.z.string().optional(),
    eeiExemptionCode: zod_1.z.string().optional(),
    hasDangerousGoods: zod_1.z.boolean().optional(),
    // Metadata
    createdAt: zod_1.z.date(),
    updatedAt: zod_1.z.date(),
    createdByUserId: zod_1.z.string(),
    // Related Entities (optional when fetching summary, required for detail usually)
    lineItems: zod_1.z.array(lineItem_1.ShipmentLineItemV1Schema).optional(),
    documents: zod_1.z.array(document_1.ShipmentDocumentV1Schema).optional(),
});
