const logger = require('../utils/logger');
const Result = require('./Result');

/**
 * Base class for all Domain Services.
 * Provides error handling, logging, and result standardization.
 */
class BaseService {
    constructor(ctx = {}) {
        this.ctx = ctx; // Request context (user, etc)
        this.logger = logger;
    }

    /**
     * Wrap execution with try/catch and logging.
     * @param {string} operationName 
     * @param {Function} fn 
     */
    async execute(operationName, fn) {
        const start = Date.now();
        try {
            this.logger.debug(`[${this.constructor.name}] ${operationName} started`);
            const data = await fn();
            const duration = Date.now() - start;
            this.logger.info(`[${this.constructor.name}] ${operationName} completed in ${duration}ms`);

            return Result.ok(data);
        } catch (error) {
            const duration = Date.now() - start;
            this.logger.error(`[${this.constructor.name}] ${operationName} failed in ${duration}ms`, error);

            return Result.fail(error.message || 'Internal logic error', error.code);
        }
    }
}

module.exports = BaseService;
