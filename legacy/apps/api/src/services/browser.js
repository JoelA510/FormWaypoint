const puppeteer = require('puppeteer');

let browserInstance = null;

async function getBrowser() {
    if (!browserInstance) {
        console.log('[Browser] Launching new browser instance...');
        browserInstance = await puppeteer.launch({
            // 'new' was transitional, 'true' is the standard for headless now.
            // Using 'shell' mode is sometimes faster but 'true' is safest.
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage', // Optimization for Docker/container environments
                '--disable-gpu'
            ]
        });

        const cleanup = async (signal) => {
            if (browserInstance) {
                console.log(`[Browser] Closing browser instance on ${signal}...`);
                await browserInstance.close();
                browserInstance = null;
                process.exit(0);
            }
        };

        // Handle process exit to cleanup
        process.on('SIGINT', () => cleanup('SIGINT'));
        process.on('SIGTERM', () => cleanup('SIGTERM'));

        // Ensure browser is disconnected properly if it crashes
        browserInstance.on('disconnected', () => {
            console.log('[Browser] Browser disconnected! Clearing instance.');
            browserInstance = null;
        });
    }
    return browserInstance;
}

module.exports = {
    getBrowser
};
