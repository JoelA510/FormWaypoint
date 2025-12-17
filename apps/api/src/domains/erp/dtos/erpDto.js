const { z } = require('zod');

const CreateExportConfigSchema = z.object({
    name: z.string().min(1),
    targetType: z.enum(['FILE', 'HTTP']),
    format: z.enum(['CSV', 'JSON']),
    destination: z.string().min(1), // URL or File Path
    schedule: z.string().optional(), // Cron
    httpMethod: z.enum(['POST', 'PUT']).optional(),
    httpHeaders: z.string().optional() // JSON string
});

module.exports = {
    CreateExportConfigSchema
};
