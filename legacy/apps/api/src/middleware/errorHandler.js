const logger = require('../utils/logger');

/**
 * Standardized Error Handling Middleware
 */
const errorHandler = (err, req, res, next) => {
    // Structured logging
    logger.error(err.message, {
        code: err.code || 'INTERNAL_ERROR',
        stack: err.stack,
        method: req.method,
        path: req.path,
        requestId: req.id, // request-id middleware if present
        details: err.details
    });

    // Default status and message
    let status = err.status || 500;
    let message = err.message || 'Internal Server Error';
    let code = err.code || 'INTERNAL_ERROR';
    let details = err.details || null;

    // Prisma Error Handling
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2002') {
            status = 409; // Conflict
            message = 'A record with this unique field already exists.';
            code = 'DUPLICATE_ENTRY';
            details = err.meta;
        } else if (err.code === 'P2025') {
            status = 404;
            message = 'Record not found.';
            code = 'NOT_FOUND';
        } else {
            status = 400; // Bad Request for other DB constraint issues
            code = 'DB_CONSTRAINT_ERROR';
        }
    } else if (err instanceof Prisma.PrismaClientValidationError) {
        status = 400;
        message = 'Invalid data provided to database.';
        code = 'DB_VALIDATION_ERROR';
    }

    // Custom Validation Errors (if we throw them with status)
    if (status === 422) {
        code = 'VALIDATION_ERROR';
    }

    // JWT Auth Errors
    if (err.name === 'UnauthorizedError') {
        status = 401;
        message = 'Invalid token';
        code = 'AUTH_ERROR';
    }

    // Production safety: Don't leak stack traces or sensitive errors
    const isDev = process.env.NODE_ENV !== 'production';

    res.status(status).json({
        error: message,
        code,
        details,
        ...(isDev && { stack: err.stack })
    });
};

module.exports = errorHandler;
