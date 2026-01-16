const Redis = require('ioredis');

const config = require('../config');

// Shared Redis connection
// Using lazy initialization or simple global singleton pattern
const redisUrl = config.redis.url || `redis://${config.redis.host}:${config.redis.port}`;

const connection = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    // Add other common config here
});

connection.on('error', (err) => {
    console.error('[Redis] Connection error:', err);
});

connection.on('connect', () => {
    console.log('[Redis] Connected to Redis at', redisUrl);
});

module.exports = {
    connection
};
