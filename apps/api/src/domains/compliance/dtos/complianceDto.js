const { z } = require('zod');

const AssessAesSchema = z.object({
    shipment: z.object({
        lineItems: z.array(z.object({
            valueUsd: z.number().optional(),
            eccn: z.string().optional(),
            htsCode: z.string().optional(),
            // other fields if needed
        })).optional(),
        destinationCountry: z.string().length(2).optional(),
        incoterm: z.string().optional(),
        parties: z.array(z.object({ // Mock for parties
            role: z.string(),
            countryCode: z.string().length(2)
        })).optional()
    })
});

const SanctionsScreenSchema = z.object({
    shipmentId: z.string().uuid()
});

const DgLookupSchema = z.object({
    unNumber: z.string().regex(/^UN\d{4}$/)
});

module.exports = {
    AssessAesSchema,
    SanctionsScreenSchema,
    DgLookupSchema
};
