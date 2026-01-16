import { z } from 'zod';
/**
 * Represents a party in the shipping process (Shipper, Consignee, Forwarder, etc.).
 * @version 1.0.0
 */
export declare const PartyV1Schema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    addressLine1: z.ZodString;
    addressLine2: z.ZodOptional<z.ZodString>;
    city: z.ZodString;
    stateOrProvince: z.ZodOptional<z.ZodString>;
    postalCode: z.ZodString;
    countryCode: z.ZodString;
    contactName: z.ZodOptional<z.ZodString>;
    phone: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodString>;
    taxIdOrEori: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type PartyV1 = z.infer<typeof PartyV1Schema>;
export declare const PartyRefSchema: z.ZodUnion<readonly [z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    addressLine1: z.ZodString;
    addressLine2: z.ZodOptional<z.ZodString>;
    city: z.ZodString;
    stateOrProvince: z.ZodOptional<z.ZodString>;
    postalCode: z.ZodString;
    countryCode: z.ZodString;
    contactName: z.ZodOptional<z.ZodString>;
    phone: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodString>;
    taxIdOrEori: z.ZodOptional<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
}, z.core.$strip>]>;
export type PartyRef = z.infer<typeof PartyRefSchema>;
