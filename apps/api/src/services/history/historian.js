const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Standardized Audit Logging Service
 */
const historian = {
    /**
     * Log an action for a Shipment
     * @param {string} shipmentId 
     * @param {string} action - e.g. 'created', 'updated', 'validated'
     * @param {string} userId - ID of user performing action
     * @param {Object} [details] - Optional JSON details about changes
     */
    logShipmentEvent: async (shipmentId, action, userId, details = null) => {
        try {
            await prisma.auditLog.create({
                data: {
                    shipmentId,
                    action,
                    userId,
                    details: details ? JSON.stringify(details) : null
                }
            });
        } catch (error) {
            console.error(`[Historian] Failed to log shipment event ${action}:`, error);
        }
    },

    /**
     * Log an action for a Document
     * @param {string} documentId 
     * @param {string} action - e.g. 'generated', 'viewed', 'exported'
     * @param {string} userId 
     * @param {Object} [details] 
     */
    logDocumentEvent: async (documentId, action, userId, details = null) => {
        try {
            await prisma.auditLog.create({
                data: {
                    documentId,
                    action,
                    userId,
                    details: details ? JSON.stringify(details) : null
                }
            });
        } catch (error) {
            console.error(`[Historian] Failed to log document event ${action}:`, error);
        }
    }
};

module.exports = historian;
