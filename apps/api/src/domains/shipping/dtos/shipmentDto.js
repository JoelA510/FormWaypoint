const { z } = require('zod');

const CreateShipmentSchema = z.object({
    shipperId: z.string().uuid(),
    consigneeId: z.string().uuid(),
    incoterm: z.enum(['EXW', 'FCA', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP', 'FAS', 'FOB', 'CFR', 'CIF']).optional(),
    currency: z.string().length(3).optional(),
    totalCustomsValue: z.number().min(0).optional(),
    totalWeightKg: z.number().min(0).optional(),
    numPackages: z.number().int().min(1).optional(),
    originCountry: z.string().length(2).optional(),
    destinationCountry: z.string().length(2).optional(),
    status: z.enum(['draft', 'quoted', 'booked', 'in_transit', 'delivered', 'cancelled']).default('draft'),
    dueDate: z.string().datetime().optional()
});

const UpdateShipmentSchema = CreateShipmentSchema.partial();

module.exports = {
    CreateShipmentSchema,
    UpdateShipmentSchema
};
