const { z } = require('zod');

const AssessAesSchema = z.object({
    shipment: z.object({
        lineItems: z.array(z.object({
            valueUsd: z.number().optional(),
            // other fields if needed
        })).optional(),
        destinationCountry: z.string().length(2).optional(),
        // ...
    })
});

const SanctionsScreenSchema = z.object({
    shipmentId: z.string().uuid()
});

module.exports = {
    AssessAesSchema,
    SanctionsScreenSchema
};
