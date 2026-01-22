"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ingestionRouter = void 0;
const hono_1 = require("hono");
const zod_1 = require("zod");
const zod_validator_1 = require("@hono/zod-validator");
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const bullmq_1 = require("bullmq");
// Mock env vars for now - user should configure
const S3_BUCKET = process.env.S3_BUCKET || 'formwaypoint-uploads';
const S3_REGION = process.env.S3_REGION || 'us-east-1';
const s3 = new client_s3_1.S3Client({ region: S3_REGION });
const ingestionQueue = new bullmq_1.Queue('ingestion-queue', {
    connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
    }
});
exports.ingestionRouter = new hono_1.Hono()
    .post('/upload-url', (0, zod_validator_1.zValidator)('json', zod_1.z.object({
    filename: zod_1.z.string(),
    contentType: zod_1.z.string(),
})), async (c) => {
    const { filename, contentType } = c.req.valid('json');
    const key = `uploads/${crypto.randomUUID()}-${filename}`;
    const command = new client_s3_1.PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        ContentType: contentType,
    });
    const url = await (0, s3_request_presigner_1.getSignedUrl)(s3, command, { expiresIn: 3600 });
    return c.json({ url, key });
})
    .post('/trigger', (0, zod_validator_1.zValidator)('json', zod_1.z.object({
    key: zod_1.z.string(),
    shipmentId: zod_1.z.string().optional(),
})), async (c) => {
    const { key, shipmentId } = c.req.valid('json');
    const job = await ingestionQueue.add('process-document', {
        key,
        shipmentId,
        bucket: S3_BUCKET
    });
    return c.json({ jobId: job.id, message: 'Ingestion started' });
});
