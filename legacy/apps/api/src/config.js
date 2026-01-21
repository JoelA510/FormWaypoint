require('dotenv').config();
const fs = require('fs');

function validateEnv() {
    const isTest = process.env.NODE_ENV === 'test';

    // List of required variables for ALL environments (except test if we want to be loose there)
    const required = [
        'AUTH_SECRET',
        'STORAGE_PATH',
        'CARRIER_ACCOUNT_ENCRYPTION_KEY'
    ];

    // Variables required if features are enabled (logic could be more complex)
    // For now, we warn or fail based on policy. Current policy: Fail fast.

    if (!isTest) {
        const missing = required.filter(key => !process.env[key]);
        if (missing.length > 0) {
            console.error(`FATAL ERROR: Missing required environment variables: ${missing.join(', ')}`);
            process.exit(1);
        }
    }

    const config = {
        nodeEnv: process.env.NODE_ENV || 'development',
        port: process.env.PORT || 3001,
        frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
        authSecret: process.env.AUTH_SECRET || (isTest ? 'test-secret' : null),
        storage: {
            path: process.env.STORAGE_PATH || (isTest ? './test-storage' : './storage'),
            provider: process.env.STORAGE_PROVIDER || 'local', // 'local' or 's3'
            s3: {
                region: process.env.AWS_REGION || 'us-east-1',
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                bucket: process.env.S3_BUCKET_NAME,
                endpoint: process.env.S3_ENDPOINT,
                publicUrl: process.env.S3_PUBLIC_URL
            }
        },
        redis: {
            host: process.env.REDIS_HOST,
            port: parseInt(process.env.REDIS_PORT || '6379', 10),
            url: process.env.REDIS_URL
        },
        email: {
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: parseInt(process.env.SMTP_PORT || '587', 10),
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        },
        carriers: {
            fedexUrl: process.env.FEDEX_API_URL || 'https://apis-sandbox.fedex.com',
            upsUrl: process.env.UPS_API_URL || 'https://wwwcie.ups.com/api'
        }
    };

    return config;
}

const config = validateEnv();

module.exports = config;
