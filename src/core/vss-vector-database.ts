import * as sqlite3 from 'sqlite3';
import { VssLoader } from './vss-loader';
import { VectorDatabase } from './vector-database-interface';

/**
 * VSS-based vector database implementation.
 * Uses SQLite VSS Extension for optimized vector similarity search.
 * Only available on macOS and Linux (Windows not supported).
 */
export class VssVectorDatabase implements VectorDatabase {
    private db: sqlite3.Database;
    private vssLoader: VssLoader;
    private vssAvailable: boolean = false;
    private readonly embeddingDimensions: number = 1024;

    constructor(db: sqlite3.Database, vssLoader: VssLoader) {
        this.db = db;
        this.vssLoader = vssLoader;
    }

    /**
     * Checks if VSS extension is available.
     */
    isAvailable(): boolean {
        return this.vssAvailable;
    }

    /**
     * Initializes VSS Virtual Table.
     * Must be called after VSS extension is loaded.
     * 
     * @returns Promise that resolves when VSS is initialized
     */
    async initialize(): Promise<void> {
        // Check if VSS is available
        this.vssAvailable = this.vssLoader.isAvailable();
        
        if (!this.vssAvailable) {
            // Removed console.warn to prevent stdout interference with MCP JSON-RPC protocol
            return;
        }

        try {
            // Check if virtual table already exists
            const tableExists = await this.checkVirtualTableExists();
            
            if (!tableExists) {
                // Create VSS virtual table
                await this.createVirtualTable();
                // Removed console.log to prevent stdout interference with MCP JSON-RPC protocol
            } else {
                // Removed console.log to prevent stdout interference with MCP JSON-RPC protocol
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            // Removed console.warn to prevent stdout interference with MCP JSON-RPC protocol
            this.vssAvailable = false;
        }
    }

    /**
     * Checks if the VSS virtual table exists.
     */
    private async checkVirtualTableExists(): Promise<boolean> {
        return new Promise((resolve, reject) => {
            this.db.get(
                `SELECT name FROM sqlite_master WHERE type='virtual table' AND name='embeddings_vss'`,
                (err, row) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(row !== undefined);
                    }
                }
            );
        });
    }

    /**
     * Creates the VSS virtual table.
     */
    private async createVirtualTable(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.db.run(
                `CREATE VIRTUAL TABLE embeddings_vss USING vss0(
                    embedding_vector(${this.embeddingDimensions}),
                    rowid HIDDEN
                )`,
                (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
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
     * Checks if a row exists in the VSS virtual table.
     */
    private async checkRowExists(rowid: number): Promise<boolean> {
        return new Promise((resolve, reject) => {
            this.db.get(
                `SELECT count(*) as count FROM embeddings_vss WHERE rowid = ?`,
                [rowid],
                (err, row: { count: number } | undefined) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(row ? row.count > 0 : false);
                    }
                }
            );
        });
    }

    /**
     * Inserts an embedding into the VSS virtual table.
     */
    private async insertEmbedding(rowid: number, vector: Float32Array): Promise<void> {
        return new Promise((resolve, reject) => {
            // VSS expects vector as JSON array
            const vectorArray = Array.from(vector);
            this.db.run(
                `INSERT INTO embeddings_vss(rowid, embedding_vector) VALUES (?, ?)`,
                [rowid, JSON.stringify(vectorArray)],
                (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                }
            );
        });
    }

    /**
     * Deletes an embedding from the VSS virtual table.
     */
    private async deleteEmbedding(rowid: number): Promise<void> {
        return new Promise((resolve, reject) => {
            this.db.run(
                `DELETE FROM embeddings_vss WHERE rowid = ?`,
                [rowid],
                (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                }
            );
        });
    }

    /**
     * Upserts an embedding into the VSS virtual table.
     */
    async upsertEmbedding(embeddingId: string, embeddingVector: Float32Array | number[]): Promise<void> {
        if (!this.vssAvailable) {
            return;
        }

        try {
            let vector: Float32Array;
            if (embeddingVector instanceof Float32Array) {
                vector = embeddingVector;
            } else if (embeddingVector instanceof Buffer) {
                vector = new Float32Array(
                    embeddingVector.buffer,
                    embeddingVector.byteOffset,
                    embeddingVector.length / 4
                );
            } else if (Array.isArray(embeddingVector)) {
                vector = new Float32Array(embeddingVector);
            } else {
                throw new Error(`Invalid embedding vector type: ${typeof embeddingVector}`);
            }

            const rowid = await this.getRowidFromEmbeddingId(embeddingId);

            if (rowid === null) {
                // Removed console.warn to prevent stdout interference with MCP JSON-RPC protocol
                return;
            }

            const exists = await this.checkRowExists(rowid);

            if (exists) {
                await this.deleteEmbedding(rowid);
            }

            await this.insertEmbedding(rowid, vector);
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            // Removed console.warn to prevent stdout interference with MCP JSON-RPC protocol
        }
    }

    /**
     * Searches for similar embeddings using VSS.
     */
    async search(
        queryEmbedding: Float32Array | number[],
        limit: number = 10,
        dimension?: 'X' | 'Y' | 'Z' | 'W' | 'T',
        pluginId?: string
    ): Promise<Array<{ rowid: number; distance: number; similarity?: number }>> {
        if (!this.vssAvailable) {
            // Removed console.warn to prevent stdout interference with MCP JSON-RPC protocol
            return [];
        }

        // Convert query embedding to array format
        let queryVectorArray: number[];
        if (queryEmbedding instanceof Float32Array) {
            queryVectorArray = Array.from(queryEmbedding);
        } else if (queryEmbedding instanceof Buffer) {
            const float32 = new Float32Array(
                queryEmbedding.buffer,
                queryEmbedding.byteOffset,
                queryEmbedding.length / 4
            );
            queryVectorArray = Array.from(float32);
        } else {
            queryVectorArray = Array.isArray(queryEmbedding) ? queryEmbedding : Array.from(queryEmbedding);
        }

        // Build query - VSS uses MATCH syntax
        // Note: Dimension/pluginId filtering should be done via JOIN with embeddings table
        // For simplicity, we return all results and let the caller filter
        const query = `SELECT rowid, distance FROM embeddings_vss WHERE embedding_vector MATCH ? LIMIT ?`;
        const params: any[] = [JSON.stringify(queryVectorArray), limit];

        return new Promise((resolve, reject) => {
            this.db.all(
                query,
                params,
                (err, rows: { rowid: number; distance: number }[]) => {
                    if (err) {
                        // Try alternative approach if MATCH fails
                        this.tryAlternativeSearch(queryVectorArray, limit, dimension, pluginId)
                            .then(resolve)
                            .catch(reject);
                    } else {
                        // VSS returns distance (lower = more similar)
                        // Convert to similarity score (higher = more similar)
                        resolve(rows.map(row => ({
                            rowid: row.rowid,
                            distance: row.distance || 0,
                            similarity: 1 / (1 + Math.max(row.distance || 0, 0)) // Convert distance to similarity
                        })));
                    }
                }
            );
        });
    }

    /**
     * Alternative search method (fallback if MATCH syntax doesn't work).
     */
    private async tryAlternativeSearch(
        queryVector: number[],
        limit: number,
        dimension?: 'X' | 'Y' | 'Z' | 'W' | 'T',
        pluginId?: string
    ): Promise<Array<{ rowid: number; distance: number; similarity?: number }>> {
        // Try with JOIN to embeddings table for filtering
        let query = `
            SELECT 
                e.rowid,
                vss_distance_l2(e.embedding_vector, ?) as distance
            FROM embeddings_vss e
        `;

        const params: any[] = [JSON.stringify(queryVector)];

        // Add dimension filter if provided
        if (dimension && pluginId) {
            query += ` JOIN embeddings em ON e.rowid = em.rowid
                WHERE em.dimension = ? AND em.plugin_id = ?`;
            params.push(dimension, pluginId);
        }

        query += ` ORDER BY distance LIMIT ?`;
        params.push(limit);

        return new Promise((resolve, reject) => {
            this.db.all(query, params, (err, rows: any[]) => {
                if (err) {
                    // If this also fails, return empty array (fallback to cosine similarity)
                    // Removed console.warn to prevent stdout interference with MCP JSON-RPC protocol
                    resolve([]);
                } else {
                    resolve(rows.map(row => ({
                        rowid: row.rowid,
                        distance: row.distance || 0,
                        similarity: 1 / (1 + Math.max(row.distance || 0, 0))
                    })));
                }
            });
        });
    }
}

