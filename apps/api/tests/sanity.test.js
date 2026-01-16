jest.mock('../src/config', () => ({
    port: 3003,
    nodeEnv: 'test',
    storage: { path: '/tmp/storage' },
    authSecret: 'test-secret',
    redis: { host: 'localhost', port: 6379 },
    email: { host: 'smtp.test' },
    carriers: { fedexUrl: 'http://fedex' }
}));

jest.mock('../src/services/redis', () => ({
    connection: { on: jest.fn() }
}));

jest.mock('../src/queue', () => ({
    createJob: jest.fn(),
    getJob: jest.fn(),
    addJob: jest.fn(),
    ingestionQueue: {
        getJobCounts: jest.fn().mockResolvedValue({ waiting: 0 })
    },
    prisma: {
        $connect: jest.fn(),
        $disconnect: jest.fn()
    }
}));

jest.mock('nodemailer', () => ({
    createTransporter: jest.fn().mockReturnValue({
        sendMail: jest.fn().mockResolvedValue(true)
    })
}));

jest.mock('../src/services/storage', () => ({
    saveFile: jest.fn(),
    getFilePath: jest.fn()
}));

jest.mock('../src/services/generator', () => ({
    generatePDF: jest.fn()
}));

describe('Sanity Check', () => {
    it('should import app without crashing', () => {
        const app = require('../src/index');
        expect(app).toBeDefined();
    });
});
