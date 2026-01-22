
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { ComplianceService } from './service';

const app = new Hono()
    .post('/aes/assess', zValidator('json', z.object({
        shipmentId: z.string().uuid()
    })), async (c) => {
        const { shipmentId } = c.req.valid('json');
        try {
            const result = await ComplianceService.determineAesRequirement(shipmentId);
            return c.json(result);
        } catch (e) {
            return c.json({ error: 'Failed to assess AES' }, 500);
        }
    })
    .post('/sanctions/screen', zValidator('json', z.object({
        shipmentId: z.string().uuid()
    })), async (c) => {
        const { shipmentId } = c.req.valid('json');
        try {
            const result = await ComplianceService.screenShipmentParties(shipmentId);
            return c.json(result);
        } catch (e) {
            return c.json({ error: 'Failed to screen parties' }, 500);
        }
    })
    .post('/sanctions/ad-hoc', zValidator('json', z.object({
        name: z.string().min(1),
        country: z.string().optional()
    })), async (c) => {
        const { name, country } = c.req.valid('json');
        const result = await ComplianceService.screenAdHoc(name, country);
        return c.json(result);
    })
    .get('/dg/:unNumber', async (c) => {
        const unNumber = c.req.param('unNumber');
        const result = await ComplianceService.lookupUnNumber(unNumber);
        if (!result) return c.json({ error: 'Not found' }, 404);
        return c.json(result);
    });

export const complianceRouter = app;
