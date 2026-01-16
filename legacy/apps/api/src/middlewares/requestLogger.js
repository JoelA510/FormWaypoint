const fs = require('fs');
const path = require('path');

// Simple file-based logger for now, ideally MongoDB/Postgres
const LOG_FILE = path.join(__dirname, '../../../logs/api_requests.jsonl');

try {
    const logDir = path.dirname(LOG_FILE);
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }
} catch (e) {
    console.error('[RequestLogger] Failed to create log directory', e);
}

const requestLogger = (req, res, next) => {
    // Capture start time
    const start = Date.now();

    // Hook into response finish
    res.on('finish', () => {
        const duration = Date.now() - start;

        // Filter sensitive headers
        const logEntry = {
            id: req.headers['x-request-id'] || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date().toISOString(),
            method: req.method,
            url: req.originalUrl,
            headers: { ...req.headers, authorization: '[REDACTED]' },
            body: req.body, // CAUTION: Scrub PII/Secrets in real impl
            statusCode: res.statusCode,
            durationMs: duration,
            ip: req.ip
        };

        // Append to JSONL file
        // In simulation/dev mode, this allows "Replaying" by reading this file
        fs.appendFile(LOG_FILE, JSON.stringify(logEntry) + '\n', (err) => {
            if (err) console.error('[RequestLogger] Failed to write log', err);
        });
    });

    next();
};

module.exports = requestLogger;
