const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { v4: uuidv4 } = require('uuid');

/**
 * Service to handle full shipment export and import.
 */
const importExportService = {
    /**
     * Export a full shipment tree to a JSON-serializable object.
     * @param {string} shipmentId 
     * @returns {Promise<Object>} Full shipment data
     */
    exportShipment: async (shipmentId) => {
        const shipment = await prisma.shipment.findUnique({
            where: { id: shipmentId },
            include: {
                lineItems: true,
                documents: true,
                carrierMeta: true,
                // We do NOT include 'shipper', 'consignee' relations directly as they are linked by ID.
                // However, for true portability, we should probably fetch the party data if we want to restore it?
                // For this V1, we will assume parties exist or we just keep the IDs. 
                // Wait, if we import into a new system, those IDs won't exist.
                // Better strategy: Include the snapshot data if available, or fetch the party data and embed it?
                // The current design relies on 'shipperSnapshot' which IS embedded.
                // So we can rely on that for the record.
                // But typically a "full backup" might want to restore the links.
                // For simplicity in Epic 19 Task-13, let's keep it scoped to the Shipment unit.
                // If IDs don't exist on import, we might warn or just keep them null.
            }
        });

        if (!shipment) {
            throw new Error(`Shipment not found: ${shipmentId}`);
        }

        // Clean up internal fields if necessary (e.g. remove tenant-specific IDs if we were multi-tenant)
        // For backup, we want everything.

        // Add metadata
        const exportData = {
            version: '1.0',
            exportedAt: new Date().toISOString(),
            type: 'SHIPMENT_EXPORT',
            data: shipment
        };

        return exportData;
    },

    /**
     * Import a shipment from JSON data.
     * Creates a NEW shipment record with new IDs to avoid conflicts.
     * @param {Object} importPayload 
     * @param {string} userId - ID of user performing import
     * @returns {Promise<Object>} The new shipment
     */
    importShipment: async (importPayload, userId) => {
        if (importPayload.type !== 'SHIPMENT_EXPORT' || !importPayload.data) {
            throw new Error('Invalid import format. Expected type SHIPMENT_EXPORT.');
        }

        const source = importPayload.data;

        // Generate new IDs
        const newShipmentId = uuidv4();

        // Remap line items
        const lineItemsCreate = (source.lineItems || []).map(line => {
            const { id, shipmentId, ...rest } = line; // Drop old IDs
            return rest;
        });

        // Remap documents (Metadata only! We can't easily import the files unless they are base64 encoded in the JSON)
        // If the export was light, maybe we skip docs or just keep records pointing to dead URLs?
        // Let's keep the records but note they might be broken links if not on same storage.
        // Ideally we would filter out auto-generated docs or those that are strictly files.
        // For this pass, let's skip importing 'documents' to avoid broken links, 
        // OR we just import them as metadata only.
        // Let's skip documents for safety in this iteration unless they are data-only.

        // Prepare main payload
        // We drop 'id', 'createdAt', 'updatedAt' from source
        const { id, createdAt, updatedAt, lineItems, documents, carrierMeta, ...shipmentFields } = source;

        // Create
        const result = await prisma.shipment.create({
            data: {
                ...shipmentFields,
                id: newShipmentId,
                createdByUserId: userId, // Set current user as creator
                status: 'draft', // Reset to draft or keep original? Let's keep original for state restoration.
                // But maybe 'draft' is safer? Let's keep original status but maybe append (Imported) to internal notes?

                lineItems: {
                    create: lineItemsCreate
                },
                // Re-create carrier meta if it exists?
                // Often carrier meta is tied to a specific transaction in the past.
                // Copying it is fine for history/record.
                carrierMeta: carrierMeta ? {
                    create: carrierMeta.map(m => {
                        const { id, shipmentId, ...mRest } = m;
                        return mRest;
                    })
                } : undefined
            },
            include: {
                lineItems: true
            }
        });

        return result;
    }
};

module.exports = importExportService;
