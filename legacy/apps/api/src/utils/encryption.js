const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const MIN_KEY_BYTES = 32;

function resolveKey(rawKey) {
    if (!rawKey) return null;
    if (/^[a-fA-F0-9]{64}$/.test(rawKey)) {
        return Buffer.from(rawKey, 'hex');
    }
    const base64Key = Buffer.from(rawKey, 'base64');
    if (base64Key.length === MIN_KEY_BYTES) {
        return base64Key;
    }
    if (Buffer.byteLength(rawKey) === MIN_KEY_BYTES) {
        return Buffer.from(rawKey);
    }
    throw new Error('CARRIER_ACCOUNT_ENCRYPTION_KEY must be 32 bytes (base64, hex, or raw).');
}

function getKey({ required = false } = {}) {
    const key = resolveKey(process.env.CARRIER_ACCOUNT_ENCRYPTION_KEY);
    if (!key && required) {
        throw new Error('Missing CARRIER_ACCOUNT_ENCRYPTION_KEY for carrier account encryption.');
    }
    return key;
}

function encryptValue(value) {
    if (value === null || value === undefined) return value;
    const key = getKey({ required: true });
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join(':');
}

function decryptValue(value) {
    if (value === null || value === undefined) return value;
    const key = getKey();
    if (!key) {
        const parts = String(value).split(':');
        if (parts.length === 3) {
            throw new Error('Missing CARRIER_ACCOUNT_ENCRYPTION_KEY for decrypting carrier data.');
        }
        return value;
    }
    const parts = String(value).split(':');
    if (parts.length !== 3) {
        return value;
    }
    const [ivB64, tagB64, payloadB64] = parts;
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const payload = Buffer.from(payloadB64, 'base64');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(payload), decipher.final()]);
    return decrypted.toString('utf8');
}

module.exports = {
    encryptValue,
    decryptValue
};
