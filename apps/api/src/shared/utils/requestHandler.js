/**
 * Standardized request handler for Service Result pattern.
 * @param {Object} res - Express response object
 * @param {Promise} servicePromise - The service method execution promise
 * @param {Object} options - { successStatus, errorStatus }
 */
const handleRequest = async (res, servicePromise, options = {}) => {
    const successStatus = options.successStatus || 200;
    const defaultErrorStatus = options.errorStatus || 500; // conservative default

    try {
        const result = await servicePromise;

        if (result && typeof result.isSuccess !== 'boolean') {
            // Fallback for non-Result returns (if any)
            return res.status(successStatus).json(result);
        }

        if (result.isSuccess) {
            res.status(successStatus).json(result.getValue());
        } else {
            const errorMsg = result.getError();
            let status = defaultErrorStatus;

            // Simple heuristic for status codes based on error message
            // In a real app, Result might carry an error code enum
            if (errorMsg.toLowerCase().includes('not found')) status = 404;
            else if (errorMsg.toLowerCase().includes('invalid')) status = 400;
            else if (errorMsg.toLowerCase().includes('unauthorized')) status = 401;

            res.status(status).json({ error: errorMsg });
        }
    } catch (err) {
        console.error('Unhandled Route Error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = handleRequest;
