const { z } = require('zod');

const CreateTemplateSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    shipperId: z.string().uuid().optional(),
    consigneeId: z.string().uuid().optional(),
    incoterm: z.string().optional(),
    originCountry: z.string().length(2).optional(),
    destinationCountry: z.string().length(2).optional(),
    lineItems: z.string().optional() // JSON string of items
});

const UpdateTemplateSchema = CreateTemplateSchema.partial();

module.exports = {
    CreateTemplateSchema,
    UpdateTemplateSchema
};
