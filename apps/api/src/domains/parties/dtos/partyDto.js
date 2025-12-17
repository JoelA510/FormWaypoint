const { z } = require('zod');

const CreatePartySchema = z.object({
    name: z.string().min(1),
    addressLine1: z.string().min(1),
    addressLine2: z.string().optional(),
    city: z.string().min(1),
    stateOrProvince: z.string().optional(),
    postalCode: z.string().min(1),
    countryCode: z.string().length(2),
    contactName: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional(),
    taxIdOrEori: z.string().optional(),
    isAddressBookEntry: z.boolean().default(false),
});

const UpdatePartySchema = CreatePartySchema.partial();

module.exports = {
    CreatePartySchema,
    UpdatePartySchema
};
