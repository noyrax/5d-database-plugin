import * as sqlite3 from 'sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { VectorDatabase } from './vector-database-interface';
import { DefaultEmbeddingFunction } from '@chroma-core/default-embed';

/**
 * ChromaDB-based vector database implementation for Windows.
 * Uses ChromaDB as an external vector database via HTTP API.
 * 
 * Note: ChromaDB must be running as a local server or embedded instance.
 * For embedded mode, ChromaDB requires Python, but we can use the HTTP client.
 */
export class ChromaDbVectorDatabase implements VectorDatabase {
    private db: sqlite3.Database;
    private workspaceRoot: string;
    private chromaClient: any | null = null;
    private collection: any | null = null;
    private available: boolean = false;
    private readonly embeddingDimensions: number = 1024;
    private readonly collectionName: string = 'embeddings';

    constructor(db: sqlite3.Database, workspaceRoot: string) {
        this.db = db;
        this.workspaceRoot = workspaceRoot;
    }

    /**
     * Checks if ChromaDB is available.
     */
    isAvailable(): boolean {
        return this.available;
    }

    /**
     * Initializes ChromaDB connection and collection.
     */
    async initialize(): Promise<void> {
        try {
            // Try to import chromadb package
            let ChromaClient: any;
            try {
                const chromadb = require('chromadb');
                ChromaClient = chromadb.ChromaClient;
                
                if (!ChromaClient) {
                    // Removed console.warn to prevent stdout interference with MCP JSON-RPC protocol
                    this.available = false;
                    return;
                }
            } catch (importError) {
                // Removed console.warn to prevent stdout interference with MCP JSON-RPC protocol
                this.available = false;
                return;
            }

            // Initialize ChromaDB client (embedded mode)
            // For embedded mode, we need to specify a persistent directory
            const chromaPath = path.join(this.workspaceRoot, '.database-plugin', 'chromadb');
            
            try {
                // Use ChromaDB server (default: localhost:8000)
                // Note: ChromaDB server needs to be started separately: chroma run --host localhost --port 8000
                this.chromaClient = new ChromaClient({
                    host: 'localhost',
                    port: 8000
                });
                // Removed console.log to prevent stdout interference with MCP JSON-RPC protocol
            } catch (serverError) {
                // Removed console.warn to prevent stdout interference with MCP JSON-RPC protocol
                this.available = false;
                return;
            }

            // Get or create collection with DefaultEmbeddingFunction
            // Note: We still provide embeddings directly via upsertEmbedding, but ChromaDB requires
            // an embedding function for collection initialization. The DefaultEmbeddingFunction is used
            // for collection structure, but we override it by providing embeddings directly.
            try {
                this.collection = await this.chromaClient.getOrCreateCollection({
                    name: this.collectionName,
                    embeddingFunction: new DefaultEmbeddingFunction(),
                    metadata: {
                        description: 'Embeddings for 5D Database Plugin V-Dimension'
                    }
                });
                this.available = true;
                // Removed console.log to prevent stdout interference with MCP JSON-RPC protocol
            } catch (collectionError) {
                // Removed console.warn to prevent stdout interference with MCP JSON-RPC protocol
                this.available = false;
            }
        } catch (error) {
            // Removed console.warn to prevent stdout interference with MCP JSON-RPC protocol
            this.available = false;
        }
    }

    /**
     * Upserts an embedding into ChromaDB.
     */
    async upsertEmbedding(embeddingId: string, embeddingVector: Float32Array | number[]): Promise<void> {
        if (!this.available || !this.collection) {
            return;
        }

        try {
            // Convert to number array
            let vector: number[];
            if (embeddingVector instanceof Float32Array) {
                vector = Array.from(embeddingVector);
            } else {
                vector = embeddingVector;
            }

            // Get metadata from embeddings table (dimension, plugin_id, etc.)
            // We need to query by ID directly since we don't have pluginId here
            const embedding = await this.getEmbeddingById(embeddingId);

            if (!embedding) {
                // Removed console.warn to prevent stdout interference with MCP JSON-RPC protocol
                return;
            }

            // Upsert to ChromaDB
            await this.collection.upsert({
                ids: [embeddingId],
                embeddings: [vector],
                metadatas: [{
                    dimension: embedding.dimension,
                    entity_id: embedding.entity_id,
                    external_id: embedding.external_id,
                    plugin_id: embedding.plugin_id,
                    embedding_model: embedding.embedding_model
                }]
            });
        } catch (error) {
            // Removed console.warn to prevent stdout interference with MCP JSON-RPC protocol
        }
    }

    /**
     * Searches for similar embeddings using ChromaDB.
     */
    async search(
        queryEmbedding: Float32Array | number[],
        limit: number,
        dimension?: 'X' | 'Y' | 'Z' | 'W' | 'T',
        pluginId?: string
    ): Promise<Array<{ rowid: number; distance: number; similarity?: number }>> {
        if (!this.available || !this.collection) {
            return [];
        }

        try {
            // Convert query embedding to number array
            let queryVector: number[];
            if (queryEmbedding instanceof Float32Array) {
                queryVector = Array.from(queryEmbedding);
            } else {
                queryVector = queryEmbedding;
            }

            // Build where clause for filtering
            // ChromaDB requires $and operator when multiple conditions are present
            let where: any = undefined;
            const conditions: any[] = [];
            if (dimension) {
                conditions.push({ dimension: dimension });
            }
            if (pluginId) {
                conditions.push({ plugin_id: pluginId });
            }
            
            if (conditions.length === 1) {
                where = conditions[0];
            } else if (conditions.length > 1) {
                where = { $and: conditions };
            }

            // Query ChromaDB
            const results = await this.collection.query({
                queryEmbeddings: [queryVector],
                nResults: limit,
                where: where
            });

            // Map ChromaDB results to our format
            // ChromaDB returns: { ids: string[][], distances: number[][], metadatas: any[][], ... }
            const mappedResults: Array<{ rowid: number; distance: number; similarity?: number }> = [];

            if (results.ids && results.ids[0]) {
                for (let i = 0; i < results.ids[0].length; i++) {
                    const embeddingId = results.ids[0][i];
                    const distance = results.distances?.[0]?.[i] || 0;

                    // Get rowid from embeddings table
                    const rowid = await this.getRowidFromEmbeddingId(embeddingId);
                    if (rowid === null) {
                        continue;
                    }

                    // Convert distance to similarity (ChromaDB uses cosine distance, 0 = identical, 2 = opposite)
                    // Cosine similarity = 1 - (distance / 2), clamped to [0, 1]
                    const similarity = Math.max(0, Math.min(1, 1 - (distance / 2)));

                    mappedResults.push({
                        rowid: rowid,
                        distance: distance,
                        similarity: similarity
                    });
                }
            }

            return mappedResults;
        } catch (error) {
            // Removed console.warn to prevent stdout interference with MCP JSON-RPC protocol
            return [];
        }
    }

    /**
     * Gets the embedding ID from a rowid.
     */
    async getEmbeddingIdFromRowid(rowid: number): Promise<string | null> {
        return new Promise((resolve, reject) => {
            this.db.get(
                `SELECT id FROM embeddings WHERE rowid = ?`,
                [rowid],
                (err, row: { id: string } | undefined) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(row ? row.id : null);
                    }
                }
            );
        });
    }

    /**
     * Gets the rowid for an embedding ID.
     */
    private async getRowidFromEmbeddingId(embeddingId: string): Promise<number | null> {
        return new Promise((resolve, reject) => {
            this.db.get(
                `SELECT rowid FROM embeddings WHERE id = ?`,
                [embeddingId],
                (err, row: { rowid: number } | undefined) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(row ? row.rowid : null);
                    }
                }
            );
        });
    }

    /**
     * Gets an embedding by ID (helper method).
     */
    private async getEmbeddingById(embeddingId: string): Promise<any | null> {
        return new Promise((resolve, reject) => {
            this.db.get(
                `SELECT * FROM embeddings WHERE id = ?`,
                [embeddingId],
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
}

