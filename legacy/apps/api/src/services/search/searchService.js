const { prisma } = require('../../queue'); // Use existing prisma instance

class SearchService {
    /**
     * Search documents using full-text search.
     * Note: Currently backed by SQLite LIKE queries. 
     * Ready for Postgres tsvector migration.
     * @param {string} query 
     * @param {Object} filters 
     */
    async searchDocuments(query, filters = {}) {
        // Mock Postgres Full Text Search logic
        // In Postgres: 
        // WHERE to_tsvector('english', content) @@ plainto_tsquery('english', query)

        // SQLite Fallback:
        const where = {};

        if (query) {
            where.OR = [
                { filename: { contains: query } }, // , mode: 'insensitive' (if supported)
                { header: { contains: query } },
                { lines: { contains: query } },
                { tags: { contains: query } }
            ];
        }

        if (filters.status) where.status = filters.status;
        if (filters.userId) where.userId = filters.userId;

        const results = await prisma.document.findMany({
            where,
            take: 50,
            orderBy: { createdAt: 'desc' }
        });

        return results;
    }

    /**
     * Index a document for search.
     * For Postgres, this might trigger a specific update or be handled by a generated column.
     * @param {string} documentId 
     */
    async indexDocument(documentId) {
        // No-op for SQLite (dynamic indexing)
        // For Postgres with external search (Elastic), this would push data.
        console.log(`[SearchService] Indexing document ${documentId}`);

        // Potential: Update a `searchVector` column if we were using raw SQL here.
    }
}

module.exports = new SearchService();
