import { MultiDbManager } from '../core/multi-db-manager';
import { EmbeddingGenerator } from '../embedding/embedding-generator';
import { EmbeddingRepository } from '../repositories/embedding-repository';
import { ImportanceRepository } from '../repositories/importance-repository';
import { VectorDatabase } from '../core/vector-database-interface';
import { EntityReference } from '../models/entity-reference';
import * as sqlite3 from 'sqlite3';

/**
 * Semantic search result
 */
export interface SemanticSearchResult {
    dimension: 'X' | 'Y' | 'Z' | 'W' | 'T';
    entityId: string;
    externalId: string;
    score: number;  // Combined relevance score
    vectorScore: number;  // Vector similarity score
    importanceScore: number;  // Importance score
    entityRef: EntityReference;
}

/**
 * Options for semantic search
 */
export interface SemanticSearchOptions {
    dimensions?: ('X' | 'Y' | 'Z' | 'W' | 'T')[];
    limit?: number;
    minScore?: number;
}

/**
 * API for semantic search over all dimensions using vector similarity.
 */
export class SemanticSearchApi {
    private dbManager: MultiDbManager;
    private embeddingGenerator: EmbeddingGenerator;
    private readonly vectorWeight: number = 0.7;
    private readonly importanceWeight: number = 0.3;

    constructor(dbManager: MultiDbManager, embeddingGenerator: EmbeddingGenerator) {
        this.dbManager = dbManager;
        this.embeddingGenerator = embeddingGenerator;
    }

    /**
     * Performs semantic search across all or specified dimensions.
     * 
     * @param query Natural language query
     * @param pluginId Plugin ID
     * @param options Search options
     * @returns Promise that resolves to search results sorted by relevance
     */
    async search(
        query: string,
        pluginId: string,
        options: SemanticSearchOptions = {}
    ): Promise<SemanticSearchResult[]> {
        if (!this.embeddingGenerator.isConfigured()) {
            throw new Error('Embedding generator not configured. Cannot perform semantic search.');
        }

        const dimensions = options.dimensions || ['X', 'Y', 'Z', 'W', 'T'];
        const limit = options.limit || 10;
        const minScore = options.minScore || 0.0;

        // Removed console.log to prevent stdout interference with MCP JSON-RPC protocol

        // 1. Generate query embedding
        const queryEmbedding = await this.embeddingGenerator.generateEmbedding(
            'X', // Dimension doesn't matter for query
            'query',
            query
        );

        // 2. Search in each dimension
        const allResults: SemanticSearchResult[] = [];

        for (const dimension of dimensions) {
            const dimensionResults = await this.searchDimension(
                dimension,
                queryEmbedding,
                pluginId,
                minScore
            );
            allResults.push(...dimensionResults);
        }

        // 3. Sort by combined score (descending)
        allResults.sort((a, b) => b.score - a.score);

        // 4. Apply limit
        return allResults.slice(0, limit);
    }

    /**
     * Searches in a specific dimension using vector similarity.
     * Uses VSS if available, otherwise falls back to cosine similarity.
     */
    private async searchDimension(
        dimension: 'X' | 'Y' | 'Z' | 'W' | 'T',
        queryEmbedding: number[],
        pluginId: string,
        minScore: number
    ): Promise<SemanticSearchResult[]> {
        const db = await this.dbManager.getDatabase('V');
        const embeddingRepo = new EmbeddingRepository(db);
        const importanceRepo = new ImportanceRepository(db);
        const vectorDb = this.dbManager.getVectorDatabase();

        const model = this.embeddingGenerator.getModel();

        // Try vector database search first if available
        if (vectorDb && vectorDb.isAvailable()) {
            try {
                return await this.searchWithVectorDatabase(
                    dimension,
                    queryEmbedding,
                    pluginId,
                    minScore,
                    vectorDb,
                    embeddingRepo,
                    importanceRepo
                );
            } catch (vectorDbError) {
                // Removed console.warn to prevent stdout interference with MCP JSON-RPC protocol
                // Fall through to cosine similarity
            }
        }

        // Fallback: Manual cosine similarity
        return await this.searchWithCosineSimilarity(
            dimension,
            queryEmbedding,
            pluginId,
            minScore,
            embeddingRepo,
            importanceRepo,
            model
        );
    }

    /**
     * Searches using vector database (VSS or external DB).
     */
    private async searchWithVectorDatabase(
        dimension: 'X' | 'Y' | 'Z' | 'W' | 'T',
        queryEmbedding: number[],
        pluginId: string,
        minScore: number,
        vectorDb: VectorDatabase,
        embeddingRepo: EmbeddingRepository,
        importanceRepo: ImportanceRepository
    ): Promise<SemanticSearchResult[]> {
        // Perform vector database search
        const queryEmbeddingFloat32 = new Float32Array(queryEmbedding);
        const vectorResults = await vectorDb.search(queryEmbeddingFloat32, 100, dimension, pluginId);

        if (vectorResults.length === 0) {
            return [];
        }

        // Get importance scores
        const importanceScores = await importanceRepo.getAllByDimension(dimension, pluginId);
        const importanceMap = new Map<string, number>();
        for (const score of importanceScores) {
            importanceMap.set(score.entity_id, score.combined_score);
        }

        // Get embeddings for the rowids
        const db = await this.dbManager.getDatabase('V');
        const results: SemanticSearchResult[] = [];

        for (const vectorResult of vectorResults) {
            // Get embedding ID from rowid
            const embeddingId = await vectorDb.getEmbeddingIdFromRowid(vectorResult.rowid);
            if (!embeddingId) {
                continue;
            }

            // Get embedding by ID
            const embedding = await embeddingRepo.getById(embeddingId, pluginId);
            if (!embedding) {
                continue;
            }

            // Use vector database similarity score
            const vectorScore = vectorResult.similarity || (1 - vectorResult.distance);

            // Get importance score (default to 0 if not found)
            const importanceScore = importanceMap.get(embedding.entity_id) || 0;

            // Combine scores
            const combinedScore = this.vectorWeight * vectorScore + this.importanceWeight * importanceScore;

            if (combinedScore >= minScore) {
                results.push({
                    dimension,
                    entityId: embedding.entity_id,
                    externalId: embedding.external_id,
                    score: combinedScore,
                    vectorScore,
                    importanceScore,
                    entityRef: {
                        dimension,
                        entity_id: embedding.entity_id,
                        external_id: embedding.external_id
                    }
                });
            }
        }

        return results;
    }

    /**
     * Gets embedding by rowid.
     */
    private async getEmbeddingByRowid(
        db: sqlite3.Database,
        rowid: number,
        pluginId: string
    ): Promise<any | null> {
        return new Promise((resolve, reject) => {
            db.get(
                `SELECT * FROM embeddings WHERE rowid = ? AND plugin_id = ?`,
                [rowid, pluginId],
                (err, row: any) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(row || null);
                    }
                }
            );
        });
    }

    /**
     * Searches using manual cosine similarity (fallback).
     */
    private async searchWithCosineSimilarity(
        dimension: 'X' | 'Y' | 'Z' | 'W' | 'T',
        queryEmbedding: number[],
        pluginId: string,
        minScore: number,
        embeddingRepo: EmbeddingRepository,
        importanceRepo: ImportanceRepository,
        model: string
    ): Promise<SemanticSearchResult[]> {
        // Get all embeddings for this dimension
        const embeddings = await embeddingRepo.getAllByDimension(dimension, pluginId, model);

        if (embeddings.length === 0) {
            return [];
        }

        // Get importance scores
        const importanceScores = await importanceRepo.getAllByDimension(dimension, pluginId);
        const importanceMap = new Map<string, number>();
        for (const score of importanceScores) {
            importanceMap.set(score.entity_id, score.combined_score);
        }

        // Calculate vector similarity for each embedding
        const results: SemanticSearchResult[] = [];

        for (const embedding of embeddings) {
            // Convert Buffer to Float32Array
            const embeddingVector = new Float32Array(
                embedding.embedding_vector.buffer,
                embedding.embedding_vector.byteOffset,
                embedding.embedding_vector.length / 4
            );

            // Calculate cosine similarity
            const vectorScore = this.cosineSimilarity(queryEmbedding, Array.from(embeddingVector));

            // Get importance score (default to 0 if not found)
            const importanceScore = importanceMap.get(embedding.entity_id) || 0;

            // Combine scores
            const combinedScore = this.vectorWeight * vectorScore + this.importanceWeight * importanceScore;

            if (combinedScore >= minScore) {
                results.push({
                    dimension,
                    entityId: embedding.entity_id,
                    externalId: embedding.external_id,
                    score: combinedScore,
                    vectorScore,
                    importanceScore,
                    entityRef: {
                        dimension,
                        entity_id: embedding.entity_id,
                        external_id: embedding.external_id
                    }
                });
            }
        }

        return results;
    }

    /**
     * Calculates cosine similarity between two vectors.
     */
    private cosineSimilarity(vecA: number[], vecB: number[]): number {
        if (vecA.length !== vecB.length) {
            throw new Error(`Vector length mismatch: ${vecA.length} vs ${vecB.length}`);
        }

        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < vecA.length; i++) {
            dotProduct += vecA[i] * vecB[i];
            normA += vecA[i] * vecA[i];
            normB += vecB[i] * vecB[i];
        }

        const denominator = Math.sqrt(normA) * Math.sqrt(normB);
        if (denominator === 0) {
            return 0;
        }

        return dotProduct / denominator;
    }
}


