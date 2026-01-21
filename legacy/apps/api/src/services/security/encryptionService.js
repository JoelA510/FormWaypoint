const crypto = require('crypto');

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12;
const KEY_LENGTH_BYTES = 32;

function getEncryptionKey() {
    const rawKey = process.env.CARRIER_ACCOUNT_ENCRYPTION_KEY;
    const isTest = process.env.NODE_ENV === 'test';

    if (!rawKey) {
        if (isTest) {
            return crypto.createHash('sha256').update('test-carrier-account-key').digest();
        }
        throw new Error('Missing CARRIER_ACCOUNT_ENCRYPTION_KEY environment variable');
    }

    const normalized = rawKey.trim();
    const isHex = /^[a-fA-F0-9]{64}$/.test(normalized);
    const key = Buffer.from(normalized, isHex ? 'hex' : 'base64');

    if (key.length !== KEY_LENGTH_BYTES) {
        throw new Error('CARRIER_ACCOUNT_ENCRYPTION_KEY must decode to 32 bytes');
    }

    return key;
}

function isEncryptedPayload(value) {
    if (!value || typeof value !== 'string') return false;
    const parts = value.split(':');
    if (parts.length !== 3) return false;
    return parts.every((part) => /^[A-Za-z0-9+/=]+$/.test(part));
}

function encryptValue(plainText) {
    if (plainText === null || plainText === undefined) return plainText;
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH_BYTES);
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return [iv.toString('base64'), authTag.toString('base64'), encrypted.toString('base64')].join(':');
}

function decryptValue(cipherText) {
    if (cipherText === null || cipherText === undefined) return cipherText;
    if (!isEncryptedPayload(cipherText)) return cipherText;

    const [ivB64, tagB64, payloadB64] = cipherText.split(':');
    const key = getEncryptionKey();
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const payload = Buffer.from(payloadB64, 'base64');

    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([decipher.update(payload), decipher.final()]);
    return decrypted.toString('utf8');
}

module.exports = {
    encryptValue,
    decryptValue,
    isEncryptedPayload
};
