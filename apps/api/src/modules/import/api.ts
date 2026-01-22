
import { Hono } from 'hono';
import { ImportService } from './service';

const app = new Hono();

// Note: Hono's `zValidator` for 'form' with files is tricky type-wise in some adapters.
// We'll trust the body parsing middleware for file uploads or use standard web standard Request.

app.post('/csv', async (c) => {
    const body = await c.req.parseBody();
    const file = body['file'];

    if (!file || !(file instanceof File)) {
        return c.json({ error: 'No file uploaded' }, 400);
    }

    try {
        const buffer = Buffer.from(await file.arrayBuffer());
        // Mock userId for now, later from context
        const result = await ImportService.processCsv(buffer, 'user-id-placeholder');
        return c.json(result, 201);
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

export const importRouter = app;
