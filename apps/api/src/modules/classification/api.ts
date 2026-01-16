import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { hybridSearch } from './search';

export const classificationRouter = new Hono()
    .get(
        '/search',
        zValidator(
            'query',
            z.object({
                q: z.string().min(1),
                limit: z.string().optional().default('10').transform(Number),
            })
        ),
        async (c) => {
            const { q, limit } = c.req.valid('query');

            try {
                const results = await hybridSearch(q, limit);
                return c.json({ results });
            } catch (error) {
                console.error('Search failed', error);
                return c.json({ error: 'Search failed' }, 500);
            }
        }
    );
