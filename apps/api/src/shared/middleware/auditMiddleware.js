const logger = require('../../utils/logger');

/**
 * Creates a Prisma middleware that logs all data mutations.
 * @returns {Function} Prisma Middleware
 */
function createAuditMiddleware() {
    return async (params, next) => {
        // Actions that modify data
        const modificationActions = ['create', 'update', 'upsert', 'delete', 'createMany', 'updateMany', 'deleteMany'];

        if (modificationActions.includes(params.action)) {
            const model = params.model;
            const action = params.action;
            const context = params.args;

            // Log attempt
            logger.info(`[Audit] Mutation Attempt: ${model}.${action}`, {
                model,
                action,
                // args: JSON.stringify(context) // Be careful with huge payloads or PII
            });

            const start = Date.now();
            const result = await next(params);
            const duration = Date.now() - start;

            // Log success and maybe record the ID of the changed item
            logger.info(`[Audit] Mutation Success: ${model}.${action} (${duration}ms)`);

            // Future: Async insert into AuditLog table
            // await prisma.auditLog.create(...)

            return result;
        }

        return await next(params);
    };
}

module.exports = createAuditMiddleware;
