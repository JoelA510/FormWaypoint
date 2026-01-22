
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { FreightService } from './service';

const CarrierAccountSchema = z.object({
    provider: z.enum(['mock', 'fedex', 'ups']),
    credentials: z.string().default('{}'), // JSON string or object encoded
    accountNumber: z.string().optional(),
    description: z.string().optional(),
    userId: z.string().uuid() // In real app, comes from Context
});

const app = new Hono()
    // List Accounts
    .get('/carriers', zValidator('query', z.object({
        userId: z.string().uuid()
    })), async (c) => {
        const { userId } = c.req.valid('query');
        const accounts = await FreightService.listCarrierAccounts(userId);
        return c.json(accounts);
    })
    // Connect Account
    .post('/carriers', zValidator('json', CarrierAccountSchema), async (c) => {
        const data = c.req.valid('json');
        const account = await FreightService.connectCarrierAccount(data);
        return c.json(account, 201);
    })
    // Shop Rates
    .post('/rates/shop', zValidator('json', z.object({
        shipmentId: z.string().uuid(),
        userId: z.string().uuid()
    })), async (c) => {
        const { shipmentId, userId } = c.req.valid('json');
        try {
            const rates = await FreightService.shopRates(shipmentId, userId);
            return c.json(rates);
        } catch (e) {
            return c.json({ error: 'Failed to shop rates' }, 500);
        }
    });

export const freightRouter = app;
