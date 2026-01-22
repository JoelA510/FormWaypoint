
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { TemplateService } from './service';
import { DocumentGenerator } from './generator';

const ShipmentTemplateSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    incoterm: z.string().optional(),
    originCountry: z.string().length(2).optional(),
    destinationCountry: z.string().length(2).optional(),
    userId: z.string().uuid()
});

const app = new Hono()
    // Presets
    .get('/presets', zValidator('query', z.object({ userId: z.string().uuid() })), async (c) => {
        const { userId } = c.req.valid('query');
        const templates = await TemplateService.listTemplates(userId);
        return c.json(templates);
    })
    .post('/presets', zValidator('json', ShipmentTemplateSchema), async (c) => {
        const data = c.req.valid('json');
        const template = await TemplateService.createTemplate(data);
        return c.json(template, 201);
    })
    // Documents
    .post('/generate', zValidator('json', z.object({
        shipmentId: z.string().uuid(),
        type: z.enum(['commercial-invoice', 'packing-list'])
    })), async (c) => {
        const { shipmentId, type } = c.req.valid('json');
        try {
            const result = await DocumentGenerator.generate(shipmentId, type);
            return c.json(result);
        } catch (e: any) {
            return c.json({ error: e.message }, 500);
        }
    });

export const templatesRouter = app;
