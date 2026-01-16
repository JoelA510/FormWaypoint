const { z } = require('zod');

const CreateForwarderProfileSchema = z.object({
    name: z.string().min(1),
    emailToJson: z.string(), // JSON array
    emailSubjectTemplate: z.string(),
    dataBundleFormat: z.enum(['CSV', 'JSON', 'NONE'])
});

module.exports = {
    CreateForwarderProfileSchema
};
