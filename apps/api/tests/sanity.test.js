jest.mock('../src/config', () => ({
    port: 3003,
    nodeEnv: 'test',
    storage: { path: '/tmp/storage' },
    authSecret: 'test-secret',
    redis: { host: 'localhost', port: 6379 },
    email: { host: 'smtp.test' },
    carriers: { fedexUrl: 'http://fedex' }
}));

// Mock redis
jest.mock('../src/services/redis', () => ({
    connection: { on: jest.fn() }
}));

// Mock queue
jest.mock('../src/queue', () => ({
    prisma: {
        $connect: jest.fn(),
        $disconnect: jest.fn()
    }
}));

// Mock nodemailer
jest.mock('nodemailer', () => ({
    createTransporter: jest.fn().mockReturnValue({
        sendMail: jest.fn().mockResolvedValue(true)
    })
}));

describe('Sanity Check', () => {
    it('should import app without crashing', () => {
        const app = require('../src/index');
        expect(app).toBeDefined();
    });
});
