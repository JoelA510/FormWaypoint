const winston = require('winston');

const isDev = process.env.NODE_ENV !== 'production';

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }), // Print stack trace
        winston.format.json()
    ),
    defaultMeta: { service: 'shipping-doc-gen-api' },
    transports: [
        new winston.transports.Console({
            format: isDev
                ? winston.format.combine(
                    winston.format.colorize(),
                    winston.format.simple(),
                    winston.format.printf(({ level, message, timestamp, stack, ...meta }) => {
                        return `${timestamp} ${level}: ${message} ${stack ? '\n' + stack : ''} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
                    })
                )
                : winston.format.json()
        })
    ]
});

module.exports = logger;
