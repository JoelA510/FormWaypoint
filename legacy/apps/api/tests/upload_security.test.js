const request = require('supertest');
const yauzl = require('yauzl');
const EventEmitter = require('events');
jest.mock('../src/routes/cx', () => (req, res, next) => next()); // Mock broken CX route

jest.mock('../src/config', () => ({
    port: 3000,
    nodeEnv: 'test',
    storage: { path: '/tmp/mock' },
    redis: { host: 'localhost', port: 6379 },
    email: { host: 'smtp.test' },
    carriers: { fedexUrl: 'http://fedex' }
}));

// Mock dependencies
jest.mock('../src/middleware/auth', () => ({
    requireAuth: (req, res, next) => {
        req.user = { id: 'test-user' };
        next();
    }
}));

jest.mock('../src/services/storage', () => ({
    saveFile: jest.fn().mockResolvedValue({ path: '/tmp/mock', filename: 'mock-file' })
}));

jest.mock('../src/queue', () => ({
    addJob: jest.fn().mockResolvedValue({ id: 'job-123' }),
    connection: { quit: jest.fn() }
}));

jest.mock('adm-zip');
const AdmZip = require('adm-zip');

// Import app AFTER mocking
const app = require('../src/index');

describe('POST /upload Security Tests', () => {

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should upload a valid PDF file (checking signature)', async () => {
        // Construct a minimal PDF buffer
        const pdfBuffer = Buffer.from('%PDF-1.4\n%RW');

        const res = await request(app)
            .post('/upload')
            .attach('file', pdfBuffer, { filename: 'test.pdf', contentType: 'application/pdf' });

        expect(res.status).toBe(202);
        expect(res.body.message).toMatch(/File upload accepted/);
    });

    it('should reject a fake PDF (signature mismatch)', async () => {
        const textBuffer = Buffer.from('Just text');

        const res = await request(app)
            .post('/upload')
            .attach('file', textBuffer, { filename: 'fake.pdf', contentType: 'application/pdf' });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/File signature mismatch|Could not detect file type/);
    });

    it('should reject execution of malware.exe', async () => {
        const exeBuffer = Buffer.from('MZxxxxx'); // PE header magic

        const res = await request(app)
            .post('/upload')
            .attach('file', exeBuffer, { filename: 'malware.exe', contentType: 'application/x-msdownload' });

        expect(res.status).toBe(400);
        // Either FileType disallowed OR signature mismatch (if file-type detects 'application/x-dosexec')
        expect(res.body.error).toMatch(/is not allowed|signature mismatch/);
    });

    it('should reject a ZIP entry with Zip Slip paths', async () => {
        // Mock AdmZip to return malicious entry
        AdmZip.mockImplementation(() => ({
            getEntries: jest.fn().mockReturnValue([
                { entryName: '../../etc/passwd', header: { size: 100 } }
            ])
        }));

        // Valid zip signature to pass validateFileSignature
        const zipBuffer = Buffer.from([0x50, 0x4B, 0x03, 0x04, 0x00]);

        const res = await request(app)
            .post('/upload')
            .attach('file', zipBuffer, { filename: 'malicious.zip', contentType: 'application/zip' });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/Malicious zip entry/);
    });

    it('should process a valid ZIP file', async () => {
        // Mock AdmZip to return valid entries
        AdmZip.mockImplementation(() => ({
            getEntries: jest.fn().mockReturnValue([
                { entryName: 'safe.txt', header: { size: 100 } }
            ])
        }));

        const zipBuffer = Buffer.from([0x50, 0x4B, 0x03, 0x04, 0x00]);

        const res = await request(app)
            .post('/upload')
            .attach('file', zipBuffer, { filename: 'good.zip', contentType: 'application/zip' });

        expect(res.status).toBe(202);
    });

});
