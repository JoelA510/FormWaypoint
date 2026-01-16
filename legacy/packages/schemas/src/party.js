"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PartyRefSchema = exports.PartyV1Schema = void 0;
const zod_1 = require("zod");
/**
 * Represents a party in the shipping process (Shipper, Consignee, Forwarder, etc.).
 * @version 1.0.0
 */
exports.PartyV1Schema = zod_1.z.object({
    id: zod_1.z.string(),
    name: zod_1.z.string(),
    // Address
    addressLine1: zod_1.z.string(),
    addressLine2: zod_1.z.string().optional(),
    city: zod_1.z.string(),
    stateOrProvince: zod_1.z.string().optional(),
    postalCode: zod_1.z.string(),
    countryCode: zod_1.z.string().length(2), // ISO 3166-1 alpha-2 expected (e.g. "US", "DE")
    // Contact
    contactName: zod_1.z.string().optional(),
    phone: zod_1.z.string().optional(),
    email: zod_1.z.string().email().optional(),
    // Identification
    taxIdOrEori: zod_1.z.string().optional(),
});
exports.PartyRefSchema = zod_1.z.union([
    exports.PartyV1Schema,
    zod_1.z.object({ id: zod_1.z.string() })
]);
