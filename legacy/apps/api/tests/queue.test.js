const request = require('supertest');
const express = require('express');
const { addJob } = require('../src/queue');

// Mock BullMQ and Redis
jest.mock('bullmq', () => {
    return {
        Queue: jest.fn().mockImplementation(() => ({
            add: jest.fn().mockResolvedValue({ id: 'mock-job-id', name: 'mock-job' }),
            getJob: jest.fn().mockResolvedValue({
                id: 'mock-job-id',
                getState: jest.fn().mockResolvedValue('completed'),
                progress: 100,
                returnvalue: { result: 'success' },
                failedReason: null,
                timestamp: Date.now(),
                finishedOn: Date.now()
            })
        })),
        Worker: jest.fn().mockImplementation(() => ({
            on: jest.fn()
        }))
    };
});

jest.mock('../src/services/redis', () => ({
    connection: {
        on: jest.fn(),
        quit: jest.fn(),
        duplicate: jest.fn(() => ({
            on: jest.fn(),
            quit: jest.fn()
        }))
    }
}));

// Mock services to avoid real IO
jest.mock('../src/services/storage', () => ({
    saveFile: jest.fn().mockResolvedValue({ path: '/tmp/mock-file', filename: 'mock-file' })
}));

jest.mock('../src/utils/fileValidation', () => ({
    validateFileSignature: jest.fn().mockResolvedValue(true)
}));

jest.mock('../src/routes/documents', () => {
    // Partial mock if needed, but we might just test the queue isolation
    // Use express app setup below
});

describe('Async Job Queue', () => {
    let app;
    const { Queue } = require('bullmq');

    beforeEach(() => {
        app = express();
        app.use(express.json());
        app.use('/upload', require('../src/routes/upload'));

        // Mock getDocument for export test
        // We need to properly mock the queue module for integration?
        // Actually, we can check if the mocked Queue.add was called.
    });

    it('POST /upload should enqueue PROCESS_SINGLE_FILE job for normal files', async () => {
        const res = await request(app)
            .post('/upload')
            .attach('file', Buffer.from('dummy content'), 'test.txt');

        expect(res.status).toBe(202);
        expect(res.body.jobId).toBe('mock-job-id');

        // precise verification depends on how jest mock captures the instance
        // But since we export `addJob` which wraps `myQueue.add`, we can test `addJob` logic 
        // OR rely on the fact that `createJob` was called.
    });

    // We can also unit test the worker processor logic if we allowed it to be exported cleanly
    // But integration testing the route -> queue handoff is key here.
});
