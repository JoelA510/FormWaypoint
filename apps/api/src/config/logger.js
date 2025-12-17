const winston = require('winston');

// Keys to redact
const SENSITIVE_KEYS = [
    'password', 'token', 'secret', 'authorization', 'credit_card',
    'email', 'phone', 'mobile', 'address', 'ssn', 'ein',
    'value', 'price', 'cost', 'amount' // Trade data
];

const redact = winston.format((info) => {
    const redactValue = (obj) => {
        if (typeof obj !== 'object' || obj === null) return obj;

        for (const key in obj) {
            if (SENSITIVE_KEYS.includes(key.toLowerCase())) {
                obj[key] = '[REDACTED]';
            } else if (typeof obj[key] === 'object') {
                redactValue(obj[key]);
            }
        }
        return obj;
    };

    return redactValue(info);
});

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        redact(),
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console()
    ]
});

module.exports = logger;
