"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.IngestResponseSchema = exports.DocumentSchema = exports.ShipmentSchema = exports.LineItemSchema = exports.PartySchema = exports.DocumentStatusEnum = exports.ShipmentStatusEnum = exports.Generated = void 0;
const zod_1 = require("zod");
__exportStar(require("./validation"), exports);
__exportStar(require("./db"), exports);
exports.Generated = __importStar(require("./generated/zod"));
__exportStar(require("@prisma/client"), exports);
// --- Enums ---
exports.ShipmentStatusEnum = zod_1.z.enum(["draft", "ready_to_book", "booked", "in_transit", "exception", "closed"]);
exports.DocumentStatusEnum = zod_1.z.enum(["pending", "processing", "completed", "failed"]);
// --- Shared Types ---
exports.PartySchema = zod_1.z.object({
    id: zod_1.z.string().uuid().optional(),
    name: zod_1.z.string().min(1),
    addressLine1: zod_1.z.string().min(1),
    addressLine2: zod_1.z.string().optional().nullable(),
    city: zod_1.z.string().min(1),
    stateOrProvince: zod_1.z.string().optional().nullable(),
    postalCode: zod_1.z.string().min(1),
    countryCode: zod_1.z.string().length(2),
    contactName: zod_1.z.string().optional().nullable(),
    phone: zod_1.z.string().optional().nullable(),
    email: zod_1.z.string().email().optional().nullable(),
    taxIdOrEori: zod_1.z.string().optional().nullable(),
});
exports.LineItemSchema = zod_1.z.object({
    id: zod_1.z.string().uuid().optional(),
    description: zod_1.z.string().min(1),
    quantity: zod_1.z.number().positive(),
    uom: zod_1.z.string().min(1), // Unit of Measure
    unitValue: zod_1.z.number().nonnegative(),
    totalValue: zod_1.z.number().nonnegative(),
    netWeightKg: zod_1.z.number().nonnegative(),
    grossWeightKg: zod_1.z.number().nonnegative().optional(),
    htsCode: zod_1.z.string().optional(),
    countryOfOrigin: zod_1.z.string().length(2).optional(),
});
// --- Core Models ---
exports.ShipmentSchema = zod_1.z.object({
    id: zod_1.z.string().uuid().optional(),
    shipper: exports.PartySchema,
    consignee: exports.PartySchema,
    forwarder: exports.PartySchema.optional().nullable(),
    incoterm: zod_1.z.string().length(3), // e.g. FOV, EXW
    currency: zod_1.z.string().length(3), // USD, EUR
    originCountry: zod_1.z.string().length(2),
    destinationCountry: zod_1.z.string().length(2),
    totalWeightKg: zod_1.z.number().nonnegative(),
    numPackages: zod_1.z.number().int().nonnegative(),
    status: exports.ShipmentStatusEnum.default("draft"),
    lineItems: zod_1.z.array(exports.LineItemSchema).optional(),
    meta: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
    createdAt: zod_1.z.date().optional(),
    updatedAt: zod_1.z.date().optional(),
});
exports.DocumentSchema = zod_1.z.object({
    id: zod_1.z.string().uuid().optional(),
    filename: zod_1.z.string().min(1),
    status: exports.DocumentStatusEnum.default("pending"),
    url: zod_1.z.string().url().optional(),
    mimeType: zod_1.z.string().optional(),
    sizeBytes: zod_1.z.number().int().nonnegative().optional(),
    createdAt: zod_1.z.date().optional(),
});
// --- Ingestion API Types ---
exports.IngestResponseSchema = zod_1.z.object({
    success: zod_1.z.boolean(),
    shipment: exports.ShipmentSchema.optional(),
    confidence: zod_1.z.number().min(0).max(1),
    errors: zod_1.z.array(zod_1.z.string()).optional(),
});
