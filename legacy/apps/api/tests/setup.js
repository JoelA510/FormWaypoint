// Global Mocks to prevent side effects in all tests

// Mock IORedis to prevent connection attempts
jest.mock('ioredis', () => {
    return jest.fn().mockImplementation(() => ({
        on: jest.fn(),
        publish: jest.fn(),
        subscribe: jest.fn(),
        disconnect: jest.fn(),
        quit: jest.fn()
    }));
});

// Mock BullMQ to prevent queue connections
jest.mock('bullmq', () => ({
    Queue: jest.fn().mockImplementation(() => ({
        add: jest.fn(),
        close: jest.fn(),
        on: jest.fn()
    })),
    Worker: jest.fn().mockImplementation(() => ({
        on: jest.fn(),
        close: jest.fn()
    }))
}));

// Mock Nodemailer to prevent SMTP connections
jest.mock('nodemailer', () => ({
    createTransport: jest.fn().mockReturnValue({
        sendMail: jest.fn().mockResolvedValue(true),
        verify: jest.fn().mockResolvedValue(true),
        close: jest.fn()
    })
}));

// Suppress console logs during tests unless verbose
if (process.env.VERBOSE !== 'true') {
    global.console = {
        ...console,
        log: jest.fn(),
        info: jest.fn(),
        debug: jest.fn(),
        // keep warn and error
        warn: console.warn,
        error: console.error,
    };
}
