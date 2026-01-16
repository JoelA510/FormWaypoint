/**
 * Standardized request handler for Service Result pattern.
 * @param {Object} res - Express response object
 * @param {Promise} servicePromise - The service method execution promise
 * @param {Object} options - { successStatus, errorStatus }
 */
const Result = require('../core/Result');
const logger = require('../../utils/logger');

/**
 * Standardized request handler for Service Result pattern.
 * @param {Object} res - Express response object
 * @param {Promise} servicePromise - The service method execution promise
 * @param {Object} options - { successStatus, errorStatus }
 */
const handleRequest = async (res, servicePromise, options = {}) => {
    const successStatus = options.successStatus || 200;
    const defaultErrorStatus = options.errorStatus || 500;

    try {
        const result = await servicePromise;

        // Check if it's our standard Result result
        if (result && typeof result.isSuccess === 'boolean') {
            if (result.isSuccess) {
                return res.status(successStatus).json(result.getValue());
            } else {
                const error = result.error;
                // Prefer explicit status code from Result or Error object
                let status = result.statusCode || (error && error.statusCode) || 400;

                // Fallback heuristic if no code is present
                if (!result.statusCode && !error?.statusCode && typeof error === 'string') {
                    const msg = error.toLowerCase();
                    if (msg.includes('not found')) status = 404;
                    else if (msg.includes('unauthorized') || msg.includes('token')) status = 401;
                    else if (msg.includes('forbidden')) status = 403;
                    else status = defaultErrorStatus;
                }

                return res.status(status).json({
                    success: false,
                    error: typeof error === 'string' ? error : (error.message || 'Unknown error')
                });
            }
        }

        // Handling plain object returns (legacy support)
        return res.status(successStatus).json(result);

    } catch (err) {
        logger.error(`[RequestHandler] Uncaught error:`, err);

        const status = err.statusCode || 500;
        const message = status === 500 ? 'Internal Server Error' : err.message;

        return res.status(status).json({
            success: false,
            error: message
        });
    }
};

module.exports = handleRequest;
