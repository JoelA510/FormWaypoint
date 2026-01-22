
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { PartyService } from './service';

// Basic Zod Schema mimicking the DTO
// In production, we'd import 'generated/zod' from @repo/schema
const PartySchema = z.object({
    name: z.string().min(1),
    address: z.string().optional().nullable(),
    city: z.string().optional().nullable(),
    stateOrProvince: z.string().optional().nullable(),
    postalCode: z.string().optional().nullable(),
    country: z.string().length(2).optional().nullable(),
    contactName: z.string().optional().nullable(),
    phone: z.string().optional().nullable(),
    email: z.string().email().optional().nullable(),
    taxIdOrEori: z.string().optional().nullable(),
    isAddressBookEntry: z.boolean().default(false),
});

const app = new Hono()
    .get('/address-book', zValidator('query', z.object({
        search: z.string().optional(),
        limit: z.string().optional()
    })), async (c) => {
        const { search, limit } = c.req.valid('query');
        const l = parseInt(limit || '50');
        const results = await PartyService.listAddressBook(search, l);
        return c.json(results);
    })
    .get('/:id', async (c) => {
        const id = c.req.param('id');
        try {
            const party = await PartyService.getParty(id);
            return c.json(party);
        } catch (e) {
            return c.json({ error: 'Party not found' }, 404);
        }
    })
    .post('/', zValidator('json', PartySchema), async (c) => {
        const data = c.req.valid('json');
        const party = await PartyService.createParty(data);
        return c.json(party, 201);
    });

export const partiesRouter = app;
