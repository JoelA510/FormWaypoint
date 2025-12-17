const puppeteer = require('puppeteer');

let browserInstance = null;

async function getBrowser() {
    if (!browserInstance) {
        console.log('[Browser] Launching new browser instance...');
        browserInstance = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage', // Optimization for Docker/container environments
                '--disable-gpu'
            ]
        });

        // Handle process exit to cleanup
        process.on('SIGINT', async () => {
            if (browserInstance) {
                console.log('[Browser] Closing browser instance on signal...');
                await browserInstance.close();
                browserInstance = null;
                process.exit(0);
            }
        });

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
