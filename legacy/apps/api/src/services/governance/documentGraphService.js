const { prisma } = require('../../queue');

class DocumentGraphService {
    /**
     * Look for potential links for a document based on content.
     * @param {string} documentId 
     */
    async discoverLinks(documentId) {
        const doc = await prisma.document.findUnique({ where: { id: documentId } });
        if (!doc || !doc.header) return;

        let headerData;
        try {
            headerData = JSON.parse(doc.header);
        } catch (e) {
            return;
        }

        const poNumber = headerData.poNumber || headerData.purchaseOrder;

        if (poNumber) {
            // Find other docs with same PO
            // NOTE: Ideally we use specialized extracted attributes table or JSON query, 
            // but here we might do a simple text search or assume consistent parsing.

            // Simulating a more complex match
            const relatedDocs = await prisma.document.findMany({
                where: {
                    id: { not: documentId },
                    header: { contains: poNumber }
                }
            });

            for (const related of relatedDocs) {
                // Determine relationship type logic
                let relType = 'RELATED';

                await this.createLink(documentId, related.id, relType, 0.8);
            }
        }
    }

    async createLink(sourceId, targetId, type, confidence) {
        // Prevent dupes
        const existing = await prisma.documentLink.findFirst({
            where: {
                sourceId,
                targetId,
                type
            }
        });

        if (!existing) {
            await prisma.documentLink.create({
                data: {
                    sourceId,
                    targetId,
                    type,
                    confidence
                }
            });
            console.log(`[DocumentGraph] Linked ${sourceId} -> ${targetId} (${type})`);
        }
    }
}

module.exports = new DocumentGraphService();
