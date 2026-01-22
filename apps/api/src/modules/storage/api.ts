
import { Hono } from 'hono';
import { storageService } from './service';

export const storageRouter = new Hono();

storageRouter.post('/upload', async (c) => {
    const body = await c.req.parseBody();
    const file = body['file'];

    if (!(file instanceof File)) {
        return c.json({ error: 'No file provided' }, 400);
    }

    const buffer = await file.arrayBuffer();
    const result = await storageService.saveFile(
        Buffer.from(buffer),
        file.name,
        file.type
    );

    return c.json(result);
});
