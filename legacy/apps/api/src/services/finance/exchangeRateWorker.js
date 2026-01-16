const { Worker } = require('bullmq');
const connection = require('../services/redis');
const { prisma } = require('../queue/index');

/**
 * ExchangeRateWorker
 * Fetches daily rates from openexchangerates.org (or mock)
 */
const processor = async (job) => {
    console.log(`[ExchangeRateWorker] Fetching rates for ${job.data.baseCurrency || 'USD'}`);

    // Mock API Call
    const rates = {
        'EUR': 0.85,
        'GBP': 0.75,
        'CAD': 1.25,
        'JPY': 110.0
    };

    const base = job.data.baseCurrency || 'USD';
    const date = new Date();

    // Upsert rates
    for (const [currency, rate] of Object.entries(rates)) {
        await prisma.exchangeRate.upsert({
            where: {
                currencyFrom_currencyTo_date: {
                    currencyFrom: base,
                    currencyTo: currency,
                    date: date // In real world, normalize to start of day
                }
            },
            update: { rate },
            create: {
                currencyFrom: base,
                currencyTo: currency,
                rate,
                date
            }
        });
    }

    return { fetched: Object.keys(rates).length };
};

const worker = new Worker('finance-queue', processor, {
    connection,
    concurrency: 1
});

module.exports = { worker };
