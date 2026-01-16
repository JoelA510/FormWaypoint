import { z } from 'zod';

/**
 * Represents a party in the shipping process (Shipper, Consignee, Forwarder, etc.).
 * @version 1.0.0
 */
export const PartyV1Schema = z.object({
    id: z.string(),
    name: z.string(),

    // Address
    addressLine1: z.string(),
    addressLine2: z.string().optional(),
    city: z.string(),
    stateOrProvince: z.string().optional(),
    postalCode: z.string(),
    countryCode: z.string().length(2), // ISO 3166-1 alpha-2 expected (e.g. "US", "DE")

    // Contact
    contactName: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional(),

    // Identification
    taxIdOrEori: z.string().optional(),
});

export type PartyV1 = z.infer<typeof PartyV1Schema>;

export const PartyRefSchema = z.union([
    PartyV1Schema,
    z.object({ id: z.string() })
]);

export type PartyRef = z.infer<typeof PartyRefSchema>;
