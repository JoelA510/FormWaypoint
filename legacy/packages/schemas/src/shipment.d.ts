import { z } from 'zod';
/**
 * Canonical Shipment Schema V1.
 * This is the single source of truth for full shipment data throughout the system.
 * @version 1.0.0
 */
export declare const ShipmentV1Schema: z.ZodObject<{
    id: z.ZodString;
    schemaVersion: z.ZodString;
    erpOrderId: z.ZodOptional<z.ZodString>;
    erpShipmentId: z.ZodOptional<z.ZodString>;
    shipper: z.ZodUnion<readonly [z.ZodObject<{
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
    consignee: z.ZodUnion<readonly [z.ZodObject<{
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
    forwarder: z.ZodOptional<z.ZodUnion<readonly [z.ZodObject<{
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
    }, z.core.$strip>]>>;
    broker: z.ZodOptional<z.ZodUnion<readonly [z.ZodObject<{
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
    }, z.core.$strip>]>>;
    incoterm: z.ZodString;
    currency: z.ZodString;
    totalCustomsValue: z.ZodNumber;
    totalWeightKg: z.ZodNumber;
    numPackages: z.ZodNumber;
    originCountry: z.ZodString;
    destinationCountry: z.ZodString;
    carrierCode: z.ZodOptional<z.ZodString>;
    serviceLevelCode: z.ZodOptional<z.ZodString>;
    trackingNumber: z.ZodOptional<z.ZodString>;
    aesRequired: z.ZodOptional<z.ZodBoolean>;
    aesItn: z.ZodOptional<z.ZodString>;
    eeiExemptionCode: z.ZodOptional<z.ZodString>;
    hasDangerousGoods: z.ZodOptional<z.ZodBoolean>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    createdByUserId: z.ZodString;
    lineItems: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        shipmentId: z.ZodString;
        sku: z.ZodOptional<z.ZodString>;
        description: z.ZodString;
        quantity: z.ZodNumber;
        uom: z.ZodString;
        unitValue: z.ZodNumber;
        extendedValue: z.ZodNumber;
        netWeightKg: z.ZodNumber;
        grossWeightKg: z.ZodOptional<z.ZodNumber>;
        htsCode: z.ZodString;
        countryOfOrigin: z.ZodString;
        eccn: z.ZodOptional<z.ZodString>;
        isDangerousGoods: z.ZodOptional<z.ZodBoolean>;
        dgUnNumber: z.ZodOptional<z.ZodString>;
        dgHazardClass: z.ZodOptional<z.ZodString>;
        dgPackingGroup: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
    documents: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        shipmentId: z.ZodString;
        type: z.ZodEnum<{
            output: "output";
            input: "input";
        }>;
        format: z.ZodEnum<{
            pdf: "pdf";
            csv: "csv";
            xlsx: "xlsx";
            json: "json";
        }>;
        label: z.ZodString;
        storageKey: z.ZodString;
        createdAt: z.ZodDate;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export type ShipmentV1 = z.infer<typeof ShipmentV1Schema>;
