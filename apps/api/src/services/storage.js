const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const config = require('../config');

// Storage Provider Interface
class StorageProvider {
    async saveFile(buffer, originalName) { throw new Error('Not implemented'); }
    getFilePath(filename) { throw new Error('Not implemented'); }
}

// Local File System Provider
class LocalProvider extends StorageProvider {
    constructor() {
        super();
        if (!fs.existsSync(config.storage.path)) {
            fs.mkdirSync(config.storage.path, { recursive: true });
        }
    }

    async saveFile(buffer, originalName, mimeType) {
        const fileId = uuidv4();
        const ext = path.extname(originalName);
        const filename = `${fileId}${ext}`;
        const filePath = path.join(config.storage.path, filename);

        await fs.promises.writeFile(filePath, buffer);

        return {
            path: filePath,
            url: `/files/${filename}`,
            filename
        };
    }

    getFilePath(filename) {
        return path.join(config.storage.path, filename);
    }
}

// S3 Cloud Provider
class S3Provider extends StorageProvider {
    constructor() {
        super();
        this.client = new S3Client({
            region: config.storage.s3.region,
            credentials: {
                accessKeyId: config.storage.s3.accessKeyId,
                secretAccessKey: config.storage.s3.secretAccessKey
            },
            endpoint: config.storage.s3.endpoint
        });
        this.bucket = config.storage.s3.bucket;
    }

    async saveFile(buffer, originalName, mimeType) {
        const fileId = uuidv4();
        const ext = path.extname(originalName);
        const filename = `${fileId}${ext}`;

        await this.client.send(new PutObjectCommand({
            Bucket: this.bucket,
            Key: filename,
            Body: buffer,
            ContentType: mimeType || 'application/octet-stream',
            ServerSideEncryption: 'AES256'
        }));

        // If using Cloudflare R2 or public S3 bucket
        const publicUrl = config.storage.s3.publicUrl
            ? `${config.storage.s3.publicUrl}/${filename}`
            : `https://${this.bucket}.s3.amazonaws.com/${filename}`;

        return {
            path: filename, // S3 Key
            url: publicUrl,
            filename
        };
    }

    getFilePath(filename) {
        // For S3, this might return a signed URL or just the key
        // Current usage in app expects a local path for some operations (like PDF generation)
        // This is a limitation: PDF generation needs to be updated to handle streams if using S3
        // For now, we'll throw if trying to access local path
        throw new Error('Cannot get local file path for S3 storage');
    }
}

// Factory
const provider = config.storage.provider === 's3'
    ? new S3Provider()
    : new LocalProvider();

module.exports = {
    saveFile: (buffer, name, mimeType) => provider.saveFile(buffer, name, mimeType),
    getFilePath: (filename) => provider.getFilePath(filename)
};
