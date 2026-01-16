import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Queue } from 'bullmq';

// Mock env vars for now - user should configure
const S3_BUCKET = process.env.S3_BUCKET || 'formwaypoint-uploads';
const S3_REGION = process.env.S3_REGION || 'us-east-1';

const s3 = new S3Client({ region: S3_REGION });
const ingestionQueue = new Queue('ingestion-queue', {
    connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
    }
});

export const ingestionRouter = new Hono()
    .post(
        '/upload-url',
        zValidator(
            'json',
            z.object({
                filename: z.string(),
                contentType: z.string(),
            })
        ),
        async (c) => {
            const { filename, contentType } = c.req.valid('json');
            const key = `uploads/${crypto.randomUUID()}-${filename}`;

            const command = new PutObjectCommand({
                Bucket: S3_BUCKET,
                Key: key,
                ContentType: contentType,
            });

            const url = await getSignedUrl(s3, command, { expiresIn: 3600 });

            return c.json({ url, key });
        }
    )
    .post(
        '/trigger',
        zValidator(
            'json',
            z.object({
                key: z.string(),
                shipmentId: z.string().optional(),
            })
        ),
        async (c) => {
            const { key, shipmentId } = c.req.valid('json');

            const job = await ingestionQueue.add('process-document', {
                key,
                shipmentId,
                bucket: S3_BUCKET
            });

            return c.json({ jobId: job.id, message: 'Ingestion started' });
        }
    );
