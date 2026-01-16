const { z } = require('zod');

const CreateProductSchema = z.object({
    sku: z.string().min(1),
    description: z.string().min(1),
    htsCode: z.string().optional(),
    countryOfOrigin: z.string().length(2).optional(),
    eccn: z.string().optional(),
    defaultUnitValue: z.number().min(0).optional(),
    defaultNetWeightKg: z.number().min(0).optional(),
    uom: z.string().default('EA'),
    defaultIsDangerousGoods: z.boolean().optional(),
    defaultDgUnNumber: z.string().optional()
});

const UpdateProductSchema = CreateProductSchema.partial();

module.exports = {
    CreateProductSchema,
    UpdateProductSchema
};
