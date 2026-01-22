
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { ShipmentService } from './service';

// Re-defining input schema based on legacy DTO but using Zod directly
// Ideally we import generated types from @repo/schema if they align, 
// but often API inputs are subsets/VMs of the full DB model.
const CreateShipmentSchema = z.object({
    shipperId: z.string().uuid(),
    consigneeId: z.string().uuid(),
    incoterm: z.string().default('EXW'),
    currency: z.string().length(3).default('USD'),
    totalValue: z.number().min(0).optional(),
    totalWeight: z.number().min(0).optional(),
    numPackages: z.number().int().min(1).optional(),
    originCountry: z.string().length(2).optional(),
    destinationCountry: z.string().length(2).optional(),
    status: z.string().default('draft'),
});

const app = new Hono()
    .get('/', zValidator('query', z.object({
        page: z.string().optional(), // Query params are strings
        limit: z.string().optional(),
        status: z.string().optional()
    })), async (c) => {
        const { page, limit, status } = c.req.valid('query');
        const p = parseInt(page || '1');
        const l = parseInt(limit || '20');

        const result = await ShipmentService.listShipments(p, l, status);
        return c.json(result);
    })
    .get('/:id', async (c) => {
        const id = c.req.param('id');
        try {
            const shipment = await ShipmentService.getShipment(id);
            return c.json(shipment);
        } catch (e) {
            return c.json({ error: 'Shipment not found' }, 404);
        }
    })
    .post('/', zValidator('json', CreateShipmentSchema), async (c) => {
        const data = c.req.valid('json');

        // Transform DTO to Prisma Input
        // Note: Relation Connects need specific structure
        const prismaInput = {
            ...data,
            // Map flat IDs to connect objects
            shipper: { connect: { id: data.shipperId } },
            consignee: { connect: { id: data.consigneeId } },
        };

        // Remove flat IDs from spread to avoid "Unknown arg" if strict
        delete (prismaInput as any).shipperId;
        delete (prismaInput as any).consigneeId;

        const shipment = await ShipmentService.createShipment(prismaInput as any);
        return c.json(shipment, 201);
    });

export const shipmentRouter = app;
