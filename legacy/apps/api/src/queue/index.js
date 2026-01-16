const { Queue } = require('bullmq');
const { connection } = require('../services/redis');

// Removed local Redis instantiation logic

const myQueue = new Queue('shipping-doc-gen-queue', { connection });

/**
 * Add a job to the queue
 * @param {string} type - Job type (e.g. 'PROCESS_UPLOAD', 'GENERATE_PDF')
 * @param {Object} data - Job payload
 * @returns {Promise<Job>}
 */
async function addJob(type, data) {
    return myQueue.add(type, data, {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 1000,
        },
        removeOnComplete: 100, // Keep last 100 completed
        removeOnFail: 500,     // Keep last 500 failed for debugging
    });
}

/**
 * Get a job by ID
 * @param {string} id 
 * @returns {Promise<Job>}
 */
async function getJob(id) {
    return myQueue.getJob(id);
}

module.exports = {
    addJob,
    getJob,
    connection, // Export for worker usage
    myQueue
};
