const express = require('express');
const request = require('supertest');
const fs = require('fs');
const path = require('path');

// Mock dependencies BEFORE importing/using them
jest.mock('@prisma/client', () => {
    const mockPrisma = {
        shipmentDocument: {
            findFirst: jest.fn()
        },
        shipment: {
            findFirst: jest.fn()
        },
        $connect: jest.fn(),
        $disconnect: jest.fn()
    };
    return {
        PrismaClient: jest.fn().mockImplementation(() => mockPrisma)
    };
});

jest.mock('../src/config', () => ({
    storage: { path: require('path').resolve('/tmp/storage') },
    port: 3000,
    redis: { host: 'localhost', port: 6379 },
    email: { host: 'smtp.test' },
    carriers: { fedexUrl: 'http://fedex' },
    nodeEnv: 'test'
}));

// Mock Redis Service
jest.mock('../src/services/redis', () => ({
    connection: { on: jest.fn() }
}));

// Mock fs
// Mock fs
jest.mock('fs', () => ({
    existsSync: jest.fn(),
    createReadStream: jest.fn(),
    stat: jest.fn().mockImplementation((path, cb) => cb(null, {
        isFile: () => true,
        isDirectory: () => false,
        size: 1024,
        mtime: new Date()
    }))
}));

// Create minimal app
const app = express();
app.use(express.json());

// Mock Auth Middleware behavior & Monkeypatch sendFile
app.use((req, res, next) => {
    // Mock sendFile to avoid real fs dependency issues
    res.sendFile = jest.fn((path) => res.status(200).send('File Content'));

    if (req.headers['x-mock-user-id']) {
        req.user = {
            id: req.headers['x-mock-user-id'],
            role: req.headers['x-mock-user-role'] || 'user'
        };
    }
    next();
});

// Import and mount route UNDER TEST
const filesRouter = require('../src/routes/files');
app.use('/files', filesRouter);

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

describe('GET /files/:filename Security Tests', () => {
    const FILENAME = 'test-file.pdf';
    const OWNER_ID = 'owner-123';
    const OTHER_USER_ID = 'intruder-999';

    beforeEach(() => {
        jest.clearAllMocks();
        // Setup fs mock to say file exists by default
        require('fs').existsSync.mockReturnValue(true);
        // Setup read stream mock
        const mockStream = { pipe: jest.fn(), on: jest.fn() };
        require('fs').createReadStream.mockReturnValue(mockStream);
    });

    it('should allow access to valid owner (ShipmentDocument)', async () => {
        // Mock DB finding the document owned by user
        prisma.shipmentDocument.findFirst.mockResolvedValue({
            id: 'doc-1',
            storageKey: FILENAME,
            shipment: {
                createdByUserId: OWNER_ID
            }
        });

        const res = await request(app)
            .get(`/files/${FILENAME}`)
            .set('x-mock-user-id', OWNER_ID);

        expect(res.status).toBe(200);
    });

    it('should deny access to unauthorized user (IDOR)', async () => {
        // Mock finding the document, BUT owned by someone else
        prisma.shipmentDocument.findFirst.mockResolvedValue({
            id: 'doc-1',
            storageKey: FILENAME,
            shipment: {
                createdByUserId: OWNER_ID // Owned by OWNER_ID
            }
        });

        // Ensure Source Doc lookup also fails or returns null to fall through
        prisma.shipment.findFirst.mockResolvedValue(null);

        const res = await request(app)
            .get(`/files/${FILENAME}`)
            .set('x-mock-user-id', OTHER_USER_ID);

        // We expect 404 (Access Denied / Not Found)
        expect(res.status).toBe(404);
    });
});

// Helper for Jest matcher (if needed)
expect.extend({
    toBeOneOf(received, validValues) {
        const pass = validValues.includes(received);
        return {
            message: () => `expected ${received} to be one of ${validValues}`,
            pass
        };
    }
});
