
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { authService, RegisterSchema, LoginSchema } from './service';

export const authRouter = new Hono();

authRouter.post('/register', zValidator('json', RegisterSchema), async (c) => {
    const data = c.req.valid('json');
    try {
        const result = await authService.register(data);
        return c.json(result, 201);
    } catch (e: any) {
        return c.json({ error: e.message }, 400);
    }
});

authRouter.post('/login', zValidator('json', LoginSchema), async (c) => {
    const data = c.req.valid('json');
    try {
        const result = await authService.login(data);
        return c.json(result);
    } catch (e: any) {
        return c.json({ error: e.message }, 401);
    }
});
