import * as sqlite3 from 'sqlite3';
import { VssLoader } from './vss-loader';

/**
 * Manages VSS Virtual Table for vector similarity search.
 * Creates and maintains the embeddings_vss virtual table.
 */
export class VssManager {
    private db: sqlite3.Database;
    private vssLoader: VssLoader;
    private vssAvailable: boolean = false;

    constructor(db: sqlite3.Database, vssLoader: VssLoader) {
        this.db = db;
        this.vssLoader = vssLoader;
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
            console.warn('[VssManager] VSS extension not available. Using fallback cosine similarity.');
            return;
        }

        try {
            // Check if virtual table already exists
            const tableExists = await this.checkTableExists();
            
            if (!tableExists) {
                // Create VSS virtual table
                await this.createVirtualTable();
                console.log('[VssManager] VSS virtual table created successfully');
            } else {
                console.log('[VssManager] VSS virtual table already exists');
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.warn(`[VssManager] Failed to initialize VSS virtual table: ${errorMsg}. Using fallback cosine similarity.`);
            this.vssAvailable = false;
        }
    }

    /**
     * Checks if VSS virtual table exists.
     */
    private async checkTableExists(): Promise<boolean> {
        return new Promise((resolve, reject) => {
            this.db.get(
                `SELECT name FROM sqlite_master WHERE type='table' AND name='embeddings_vss'`,
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
            // VSS virtual table: embedding_vector(1024) - Voyage voyage-3.5 dimensions
            this.db.run(
                `CREATE VIRTUAL TABLE embeddings_vss USING vss0(
                    embedding_vector(1024),
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
     * Inserts or updates an embedding in the VSS virtual table.
     * VSS uses rowid to link to the embeddings table.
     * 
     * @param embeddingId The embedding ID (UUID) from the embeddings table
     * @param embeddingVector The embedding vector as Float32Array or Buffer
     */
    async upsertEmbedding(embeddingId: string, embeddingVector: Float32Array | Buffer): Promise<void> {
        if (!this.vssAvailable) {
            return; // Silently skip if VSS not available
        }

        try {
            // Convert to Float32Array if needed
            let vector: Float32Array;
            if (embeddingVector instanceof Buffer) {
                vector = new Float32Array(
                    embeddingVector.buffer,
                    embeddingVector.byteOffset,
                    embeddingVector.length / 4
                );
            } else if (embeddingVector instanceof Float32Array) {
                vector = embeddingVector;
            } else {
                // Should not happen, but handle gracefully
                throw new Error(`Invalid embedding vector type: ${typeof embeddingVector}`);
            }

            // Get rowid from embeddings table
            const rowid = await this.getRowidFromEmbeddingId(embeddingId);
            
            if (rowid === null) {
                console.warn(`[VssManager] Embedding ${embeddingId} not found in embeddings table`);
                return;
            }

            // Check if row exists in VSS
            const exists = await this.checkRowExists(rowid);
            
            if (exists) {
                // Update existing row - VSS uses DELETE + INSERT for updates
                await this.deleteEmbeddingByRowid(rowid);
            }
            
            // Insert new row (or re-insert after delete)
            await this.insertEmbedding(rowid, vector);
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.warn(`[VssManager] Failed to upsert embedding in VSS: ${errorMsg}`);
            // Don't throw - allow fallback to cosine similarity
        }
    }

    /**
     * Gets rowid from embedding ID.
     */
    private async getRowidFromEmbeddingId(embeddingId: string): Promise<number | null> {
        return new Promise((resolve, reject) => {
            this.db.get(
                `SELECT rowid FROM embeddings WHERE id = ?`,
                [embeddingId],
                (err, row: any) => {
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
     * Checks if a row exists in VSS virtual table.
     */
    private async checkRowExists(rowid: number): Promise<boolean> {
        return new Promise((resolve, reject) => {
            this.db.get(
                `SELECT rowid FROM embeddings_vss WHERE rowid = ?`,
                [rowid],
                (err, row) => {
                    if (err) {
                        // If table doesn't exist or query fails, assume row doesn't exist
                        resolve(false);
                    } else {
                        resolve(row !== undefined);
                    }
                }
            );
        });
    }

    /**
     * Inserts a new embedding into VSS virtual table.
     * VSS expects the vector as a JSON array or BLOB.
     */
    private async insertEmbedding(rowid: number, vector: Float32Array): Promise<void> {
        return new Promise((resolve, reject) => {
            // VSS expects vector as JSON array or as BLOB
            // Convert Float32Array to array for JSON
            const vectorArray = Array.from(vector);
            
            // Use INSERT with rowid and embedding_vector
            // VSS will handle the vector format internally
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
     * Deletes an embedding from VSS virtual table by embedding ID.
     * 
     * @param embeddingId The embedding ID (UUID) from the embeddings table
     */
    async deleteEmbedding(embeddingId: string): Promise<void> {
        if (!this.vssAvailable) {
            return;
        }

        try {
            const rowid = await this.getRowidFromEmbeddingId(embeddingId);
            if (rowid === null) {
                return; // Embedding not found
            }
            await this.deleteEmbeddingByRowid(rowid);
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.warn(`[VssManager] Failed to delete embedding from VSS: ${errorMsg}`);
        }
    }

    /**
     * Deletes an embedding from VSS virtual table by rowid.
     */
    private async deleteEmbeddingByRowid(rowid: number): Promise<void> {
        if (!this.vssAvailable) {
            return;
        }

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
     * Performs vector similarity search using VSS.
     * 
     * @param queryVector The query embedding vector
     * @param limit Maximum number of results
     * @param dimension Optional dimension filter
     * @param pluginId Plugin ID filter
     * @returns Promise that resolves to array of {rowid, distance, similarity} pairs
     */
    async search(
        queryVector: number[],
        limit: number = 10,
        dimension?: 'X' | 'Y' | 'Z' | 'W' | 'T',
        pluginId?: string
    ): Promise<Array<{ rowid: number; distance: number; similarity: number }>> {
        if (!this.vssAvailable) {
            throw new Error('VSS not available. Use fallback cosine similarity.');
        }

        try {
            // VSS uses a special search syntax
            // Build query with JOIN to embeddings table for filtering
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
                        // Try alternative VSS syntax if first fails
                        this.tryAlternativeSearch(queryVector, limit, dimension, pluginId)
                            .then(resolve)
                            .catch(reject);
                    } else {
                        // VSS returns distance (lower = more similar)
                        // Convert to similarity score (higher = more similar)
                        const results = rows.map(row => ({
                            rowid: row.rowid,
                            distance: row.distance,
                            // Convert distance to similarity (1 / (1 + distance))
                            similarity: 1 / (1 + Math.max(row.distance, 0))
                        }));
                        resolve(results);
                    }
                });
            });
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            throw new Error(`VSS search failed: ${errorMsg}`);
        }
    }

    /**
     * Alternative VSS search syntax (fallback).
     */
    private async tryAlternativeSearch(
        queryVector: number[],
        limit: number,
        dimension?: 'X' | 'Y' | 'Z' | 'W' | 'T',
        pluginId?: string
    ): Promise<Array<{ rowid: number; distance: number; similarity: number }>> {
        // Alternative: Use vss_search function directly
        let query = `
            SELECT 
                rowid,
                distance
            FROM (
                SELECT 
                    rowid,
                    vss_search(embedding_vector, ?) as distance
                FROM embeddings_vss
            )
        `;

        const params: any[] = [JSON.stringify(queryVector)];

        if (dimension && pluginId) {
            query += ` WHERE rowid IN (
                SELECT rowid FROM embeddings 
                WHERE dimension = ? AND plugin_id = ?
            )`;
            params.push(dimension, pluginId);
        }

        query += ` ORDER BY distance LIMIT ?`;
        params.push(limit);

        return new Promise((resolve, reject) => {
            this.db.all(query, params, (err, rows: any[]) => {
                if (err) {
                    reject(err);
                } else {
                    const results = rows.map(row => ({
                        rowid: row.rowid,
                        distance: row.distance || 0,
                        similarity: 1 / (1 + Math.max(row.distance || 0, 0))
                    }));
                    resolve(results);
                }
            });
        });
    }

    /**
     * Checks if VSS is available and initialized.
     */
    isAvailable(): boolean {
        return this.vssAvailable;
    }
}

