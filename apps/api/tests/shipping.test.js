const request = require('supertest');
const express = require('express');
const app = express();

// Mock ShipmentService
const mockShipmentService = {
    createShipment: jest.fn(),
    getShipment: jest.fn(),
    listShipments: jest.fn()
};
jest.mock('../src/domains/shipping/services/ShipmentService', () => mockShipmentService);

const shipmentRoutes = require('../src/domains/shipping/routes/shipmentRoutes');

app.use(express.json());
app.use('/shipments', shipmentRoutes);

const Result = require('../src/shared/core/Result');

describe('Shipment Routes', () => {

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('POST /shipments', () => {
        it('should return 201 on success', async () => {
            mockShipmentService.createShipment.mockResolvedValue(Result.ok({ id: 's1' }));

            const res = await request(app).post('/shipments').send({ origin: 'A' });

            expect(res.status).toBe(201);
            expect(res.body).toEqual({ id: 's1' });
        });

        it('should return 400 on error', async () => {
            mockShipmentService.createShipment.mockResolvedValue(Result.fail('Invalid data'));

            const res = await request(app).post('/shipments').send({});

            expect(res.status).toBe(400);
            expect(res.body).toEqual({ error: 'Invalid data' });
        });
    });

    describe('GET /shipments/:id', () => {
        it('should return 200 on success', async () => {
            mockShipmentService.getShipment.mockResolvedValue(Result.ok({ id: 's1' }));

            const res = await request(app).get('/shipments/s1');

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ id: 's1' });
        });

        it('should return 404 on failure', async () => {
            mockShipmentService.getShipment.mockResolvedValue(Result.fail('Not found'));

            const res = await request(app).get('/shipments/s999');

            expect(res.status).toBe(404);
        });
    });
});
