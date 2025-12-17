const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const crypto = require('crypto');
const logger = require('../../utils/logger');

class DigitalSignatureService {

    /**
     * Records a digital signature for a specific document or shipment.
     * @param {string} shipmentId - Related shipment ID.
     * @param {string} signerName - Name of the person signing.
     * @param {string} signatureData - Base64 encoded signature image or raw data.
     * @param {string} ipAddress - IP address of the signer for audit.
     */
    async signShipment(shipmentId, signerName, signatureData, ipAddress) {
        // Generate a hash of the signature for data integrity
        const hash = crypto.createHash('sha256').update(signatureData).digest('hex');

        // In a real system, we might update the Shipment record or add an entry to an Event Log
        // For now, we'll log it and return a "receipt" object

        logger.info(`Shipment ${shipmentId} signed by ${signerName} (IP: ${ipAddress})`);

        // We can simulate storing this "Event"
        // await prisma.event.create(...) 

        return {
            success: true,
            timestamp: new Date(),
            receiptId: crypto.randomUUID(),
            signatureHash: hash
        };
    }

    /**
     * Verifies if the signature data has not been tampered with (basic integrity check).
     */
    verifySignatureIntegrity(signatureData, originalHash) {
        const hash = crypto.createHash('sha256').update(signatureData).digest('hex');
        return hash === originalHash;
    }
}

module.exports = DigitalSignatureService;
