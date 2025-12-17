const { z } = require('zod');

const AddressSchema = z.object({
    addressLine1: z.string().min(1),
    addressLine2: z.string().optional(),
    city: z.string().min(1),
    stateOrProvince: z.string().optional(),
    postalCode: z.string().min(1),
    countryCode: z.string().length(2),
});

module.exports = {
    AddressSchema
};
