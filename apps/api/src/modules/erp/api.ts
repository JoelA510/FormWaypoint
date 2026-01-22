
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { erpService, CreateExportConfigSchema } from './service';

export const erpRouter = new Hono();

erpRouter.post('/config', zValidator('json', CreateExportConfigSchema), async (c) => {
    const data = c.req.valid('json');
    // In a real app, get userId from auth context
    const userId = 'mock-user-id';

    const config = await erpService.createConfig(data, userId);
    return c.json(config);
});

erpRouter.post('/trigger/:configId', async (c) => {
    const configId = c.req.param('configId');
    try {
        const result = await erpService.triggerExport(configId);
        return c.json(result);
    } catch (e: any) {
        return c.json({ error: e.message }, 404);
    }
});
