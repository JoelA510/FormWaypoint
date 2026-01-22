
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { ProductService } from './service';

// Schema mimicking the Prisma Input but exposed as API contract
const ProductSchema = z.object({
    sku: z.string().min(1),
    description: z.string().optional(),
    htsCode: z.string().optional(),
    originCountry: z.string().length(2).optional(),
    unitWeight: z.number().optional(),
    unitValue: z.number().optional()
});

const app = new Hono()
    .get('/', zValidator('query', z.object({
        search: z.string().optional(),
        limit: z.string().optional()
    })), async (c) => {
        const { search, limit } = c.req.valid('query');
        const l = parseInt(limit || '50');
        const products = await ProductService.listProducts(search, l);
        return c.json(products);
    })
    .get('/:sku', async (c) => {
        const sku = c.req.param('sku');
        const product = await ProductService.getProductBySku(sku);
        if (!product) return c.json({ error: 'Product not found' }, 404);
        return c.json(product);
    })
    .post('/', zValidator('json', ProductSchema), async (c) => {
        const data = c.req.valid('json');
        const product = await ProductService.upsertProduct(data);
        return c.json(product, 200);
    });

export const productsRouter = app;
