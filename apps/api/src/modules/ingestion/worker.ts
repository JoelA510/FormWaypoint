import { Worker, Job } from 'bullmq';

interface IngestionJobData {
    key: string;
    bucket: string;
    shipmentId?: string;
}

export const setupIngestionWorker = () => {
    const worker = new Worker<IngestionJobData>('ingestion-queue', async (job: Job<IngestionJobData>) => {
        console.log(`Processing ingestion job ${job.id} for key ${job.data.key}`);

        // 1. Download file from S3 (or stream it)
        // 2. Call Python OCR Service (POST /ocr-document)
        // 3. Update Shipment status in DB (Prisma)

        // For MVP, we log and simulate delay
        await new Promise(resolve => setTimeout(resolve, 1000));

        console.log(`OCR processing complete for ${job.id}`);
    }, {
        connection: {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
        }
    });

    return worker;
};
