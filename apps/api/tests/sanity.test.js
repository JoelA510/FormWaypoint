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

// Mock all routes to prevent side-effects during load
jest.mock('../src/routes/upload', () => (req, res, next) => next());
jest.mock('../src/routes/documents', () => (req, res, next) => next());
jest.mock('../src/routes/status', () => (req, res, next) => next());
jest.mock('../src/routes/auth', () => (req, res, next) => next());
jest.mock('../src/routes/metrics', () => (req, res, next) => next());
jest.mock('../src/routes/files', () => (req, res, next) => next());
jest.mock('../src/routes/config', () => (req, res, next) => next());
jest.mock('../src/routes/carriers', () => (req, res, next) => next());
jest.mock('../src/routes/notifications', () => (req, res, next) => next());
jest.mock('../src/routes/import', () => (req, res, next) => next());
jest.mock('../src/routes/webhooks', () => (req, res, next) => next());
jest.mock('../src/routes/cx', () => (req, res, next) => next());
jest.mock('../src/routes/fleet', () => (req, res, next) => next());

// Mock domain routes
jest.mock('../src/domains/compliance/routes/complianceRoutes', () => (req, res, next) => next());
jest.mock('../src/domains/templates/routes/templateRoutes', () => (req, res, next) => next());
jest.mock('../src/domains/freight/routes/freightRoutes', () => (req, res, next) => next());
jest.mock('../src/domains/erp/routes/erpRoutes', () => (req, res, next) => next());
jest.mock('../src/domains/reporting/routes/reportingRoutes', () => (req, res, next) => next());
jest.mock('../src/domains/shipping/routes/shipmentRoutes', () => (req, res, next) => next());

// Mock Middleware
jest.mock('../src/middleware/auth', () => ({
    requireAuth: (req, res, next) => next()
}));
jest.mock('../src/middleware/errorHandler', () => (err, req, res, next) => next(err));

describe('Sanity Check', () => {
    it('should import app without crashing', () => {
        const app = require('../src/index');
        expect(app).toBeDefined();
    });
});
