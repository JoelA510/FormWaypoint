const { z } = require('zod');
const { AddressSchema } = require('../../../shared/dtos/addressDto');

const CreatePartySchema = z.object({
    name: z.string().min(1),
    ...AddressSchema.shape,
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
