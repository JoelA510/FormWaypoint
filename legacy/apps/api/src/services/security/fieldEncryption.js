const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function loadEncryptionKey() {
    const rawKey = process.env.CARRIER_ACCOUNT_ENCRYPTION_KEY;
    if (!rawKey) {
        throw new Error('CARRIER_ACCOUNT_ENCRYPTION_KEY is required for carrier account encryption');
    }

    let key = Buffer.from(rawKey, 'base64');
    if (key.length !== 32) {
        key = Buffer.from(rawKey, 'hex');
    }

    if (key.length !== 32) {
        throw new Error('CARRIER_ACCOUNT_ENCRYPTION_KEY must be 32 bytes (base64 or hex encoded)');
    }

    return key;
}

function encryptString(value) {
    if (value === null || value === undefined) return value;

    const key = loadEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
}

function decryptString(payload) {
    if (payload === null || payload === undefined) return payload;

    const key = loadEncryptionKey();
    const [ivB64, tagB64, dataB64] = String(payload).split('.');

    if (!ivB64 || !tagB64 || !dataB64) {
        throw new Error('Invalid encrypted payload format');
    }

    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const data = Buffer.from(dataB64, 'base64');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return decrypted.toString('utf8');
}

module.exports = {
    encryptString,
    decryptString
};
