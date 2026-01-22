
import { Hono } from 'hono';
import { reportingService } from './service';

export const reportingRouter = new Hono();

reportingRouter.get('/summary', async (c) => {
    const from = c.req.query('from');
    const to = c.req.query('to');

    const summary = await reportingService.getShipmentSummary(from, to);
    return c.json(summary);
});
