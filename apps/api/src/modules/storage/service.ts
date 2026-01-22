
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// Simple config replacement
const STORAGE_PATH = process.env.STORAGE_PATH || 'storage';
const STORAGE_PROVIDER = process.env.STORAGE_PROVIDER || 'local';

const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    },
    endpoint: process.env.AWS_ENDPOINT, // Optional for LocalStack/MinIO
});

export interface FileResult {
    path: string;
    url: string;
    filename: string;
}

export abstract class StorageProvider {
    abstract saveFile(buffer: Buffer, originalName: string, mimeType?: string): Promise<FileResult>;
    abstract getFilePath(filename: string): string;
}

export class LocalProvider extends StorageProvider {
    constructor() {
        super();
        if (!fs.existsSync(STORAGE_PATH)) {
            fs.mkdirSync(STORAGE_PATH, { recursive: true });
        }
    }

    async saveFile(buffer: Buffer, originalName: string, mimeType?: string): Promise<FileResult> {
        const fileId = uuidv4();
        const ext = path.extname(originalName);
        const filename = `${fileId}${ext}`;
        const filePath = path.join(STORAGE_PATH, filename);

        await fs.promises.writeFile(filePath, buffer);

        return {
            path: filePath,
            url: `/files/${filename}`,
            filename,
        };
    }

    getFilePath(filename: string): string {
        return path.join(STORAGE_PATH, filename);
    }
}

export class S3Provider extends StorageProvider {
    private bucket: string;

    constructor() {
        super();
        this.bucket = process.env.AWS_BUCKET_NAME || 'formwaypoint-uploads';
    }

    async saveFile(buffer: Buffer, originalName: string, mimeType?: string): Promise<FileResult> {
        const fileId = uuidv4();
        const ext = path.extname(originalName);
        const filename = `${fileId}${ext}`;

        await s3Client.send(new PutObjectCommand({
            Bucket: this.bucket,
            Key: filename,
            Body: buffer,
            ContentType: mimeType || 'application/octet-stream',
        }));

        const publicUrl = process.env.AWS_PUBLIC_URL
            ? `${process.env.AWS_PUBLIC_URL}/${filename}`
            : `https://${this.bucket}.s3.amazonaws.com/${filename}`;

        return {
            path: filename, // S3 Key
            url: publicUrl,
            filename,
        };
    }

    getFilePath(filename: string): string {
        throw new Error('Cannot get local file path for S3 storage');
    }
}

export const storageService = STORAGE_PROVIDER === 's3' ? new S3Provider() : new LocalProvider();
