const crypto = require('crypto');
const { prisma } = require('../../queue');

class DeduplicationService {
    /**
     * Calculate SHA-256 Checksum
     * @param {Buffer} buffer 
     */
    calculateHash(buffer) {
        return crypto.createHash('sha256').update(buffer).digest('hex');
    }

    /**
     * Check if document exists based on hash.
     * @param {string} hash 
     */
    async isDuplicate(hash) {
        // Assuming 'checksums' field in Document is JSON or contains the hash.
        // For strict duplicate checking, we'd ideally have a dedicated column or index.
        // Falling back to a scan or assume we extract to a dedicated field later.

        // Simulating search on 'checksums' field which is JSON string
        // In production, use JSON_EXTRACT or a dedicated `contentHash` column

        const existing = await prisma.document.findFirst({
            where: {
                checksums: {
                    contains: hash
                }
            }
        });

        return !!existing;
    }
}

module.exports = new DeduplicationService();
