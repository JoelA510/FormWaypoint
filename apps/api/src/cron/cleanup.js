const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { validateEnv } = require('../config/env');

const config = validateEnv();

/**
 * Initialize Cron Jobs
 */
function initCronJobs() {
    console.log('Initializing cron jobs...');

    // Cleanup temporary files every day at midnight
    cron.schedule('0 0 * * *', () => {
        console.log('[Cron] Running daily cleanup...');
        cleanupTempFiles();
    });
}

/**
 * Delete files older than 24 hours from storage directory
 * (Only applies to local storage)
 */
function cleanupTempFiles() {
    if (process.env.STORAGE_PROVIDER === 's3') {
        console.log('[Cron] S3 storage enabled. Skipping local cleanup (configure S3 Lifecycle Rules instead).');
        return;
    }

    const directory = config.storagePath;
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    fs.readdir(directory, (err, files) => {
        if (err) {
            console.error('[Cron] Error reading storage directory:', err);
            return;
        }

        files.forEach(file => {
            const filePath = path.join(directory, file);
            fs.stat(filePath, (err, stats) => {
                if (err) {
                    console.error(`[Cron] Error stating file ${file}:`, err);
                    return;
                }

                if (Date.now() - stats.mtime.getTime() > maxAge) {
                    fs.unlink(filePath, err => {
                        if (err) console.error(`[Cron] Error deleting ${file}:`, err);
                        else console.log(`[Cron] Deleted old file: ${file}`);
                    });
                }
            });
        });
    });
}

module.exports = { initCronJobs };
