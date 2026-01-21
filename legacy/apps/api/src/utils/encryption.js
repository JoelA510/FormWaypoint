const crypto = require('crypto');

const ENCRYPTION_KEY_ENV = 'CARRIER_ACCOUNT_ENCRYPTION_KEY';

function getEncryptionKey() {
    const key = process.env[ENCRYPTION_KEY_ENV];
    if (!key) {
        throw new Error(`Missing ${ENCRYPTION_KEY_ENV} for credential encryption.`);
    }

    const keyBuffer = Buffer.from(key, 'base64');
    if (keyBuffer.length !== 32) {
        throw new Error(`${ENCRYPTION_KEY_ENV} must be base64-encoded 32 bytes (256-bit).`);
    }

    return keyBuffer;
}

function encryptSecret(value) {
    if (value === null || value === undefined) return value;

    const key = getEncryptionKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    const payload = Buffer.concat([iv, tag, encrypted]).toString('base64');

    return `enc:${payload}`;
}

function decryptSecret(value) {
    if (!value || typeof value !== 'string' || !value.startsWith('enc:')) {
        return value;
    }

    const key = getEncryptionKey();
    const data = Buffer.from(value.slice(4), 'base64');
    const iv = data.subarray(0, 12);
    const tag = data.subarray(12, 28);
    const encrypted = data.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);

    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

module.exports = {
    encryptSecret,
    decryptSecret
};
