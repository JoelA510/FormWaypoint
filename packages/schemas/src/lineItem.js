"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShipmentLineItemV1Schema = void 0;
const zod_1 = require("zod");
/**
 * Represents a single line item within a shipment.
 * @version 1.0.0
 */
exports.ShipmentLineItemV1Schema = zod_1.z.object({
    id: zod_1.z.string(),
    shipmentId: zod_1.z.string(),
    // Product info
    sku: zod_1.z.string().optional(),
    description: zod_1.z.string(),
    quantity: zod_1.z.number().positive(),
    uom: zod_1.z.string(), // Unit of Measure (e.g. "EA", "PCS", "KG")
    // Value
    unitValue: zod_1.z.number().nonnegative(),
    extendedValue: zod_1.z.number().nonnegative(), // Should be quantity * unitValue
    // Weights
    netWeightKg: zod_1.z.number().nonnegative(),
    grossWeightKg: zod_1.z.number().nonnegative().optional(),
    // Compliance / Customs
    htsCode: zod_1.z.string(), // Harmonized Tariff Schedule code
    countryOfOrigin: zod_1.z.string(), // ISO country code
    eccn: zod_1.z.string().optional(), // Export Control Classification Number
    // Dangerous Goods
    isDangerousGoods: zod_1.z.boolean().optional(),
    dgUnNumber: zod_1.z.string().optional(),
    dgHazardClass: zod_1.z.string().optional(),
    dgPackingGroup: zod_1.z.string().optional(),
});
