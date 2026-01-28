import { prisma } from '@repo/schema';

// NOTE: Ideally we use TypedSQL, but for now we use $queryRawUnsafe or $queryRaw 
// to construct the ParadeDB hybrid query.
// Once prisma generation works with typedSql preview, we can move to .sql files.



export interface SearchResult {
  id: string;
  code: string;
  description: string;
  score: number;
}

export const hybridSearch = async (query: string, limit = 10): Promise<SearchResult[]> => {
  // ParadeDB Hybrid Search:
  // BM25 for keyword matching (using @@@ operator)
  // Vector search for semantic matching (using <=> or <-> logic with pgvector)

  // Example ParadeDB hybrid query pattern:
  // SELECT id, code, description, rating
  // FROM hts_codes
  // WHERE description @@@ 'query'
  // ORDER BY vector_column <=> 'vector_embedding'
  // LIMIT 10;

  // Since we don't have the embedding generation here yet (Python service),
  // we will implement the BM25 part first as a baseline.

  // TODO: Call Python service /predict-hts to get embedding vector if needed for true hybrid.
  // For now, we assume lexical match is primary.

  const results = await prisma.$queryRawUnsafe<SearchResult[]>(`
    SELECT id, code, description, paradedb.score(id) as score
    FROM hts_codes
    WHERE description @@@ $1
    LIMIT $2
  `, query, limit);

  return results;
};
