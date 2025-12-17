"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShipmentDocumentV1Schema = void 0;
const zod_1 = require("zod");
/**
 * Represents a document attached to a shipment (input or output).
 * @version 1.0.0
 */
exports.ShipmentDocumentV1Schema = zod_1.z.object({
    id: zod_1.z.string(),
    shipmentId: zod_1.z.string(),
    type: zod_1.z.enum(["input", "output"]),
    format: zod_1.z.enum(["pdf", "csv", "xlsx", "json"]),
    label: zod_1.z.string(), // e.g., "Commercial Invoice PDF"
    storageKey: zod_1.z.string(), // Path or URL to the file in storage
    createdAt: zod_1.z.date(),
});
