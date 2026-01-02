import * as sqlite3 from 'sqlite3';
import { BaseRepositoryImpl } from './base-repository';
import { Dimension } from '../core/multi-db-manager';

/**
 * Embedding model for V-Dimension
 */
export interface Embedding {
    id: string;  // Internal UUID
    plugin_id: string;
    dimension: 'X' | 'Y' | 'Z' | 'W' | 'T';
    entity_id: string;  // Internal ID from corresponding dimension
    external_id: string;  // External ID (file_path, symbol_id, etc.)
    content_hash: string;  // Hash of original content
    embedding_model: string;  // e.g., 'text-embedding-3-small'
    embedding_vector: Buffer;  // VSS vector (1536 floats as binary)
    created_at: Date;
    updated_at: Date;
}

/**
 * Repository for V-Dimension: Embeddings
 */
export class EmbeddingRepository extends BaseRepositoryImpl<Embedding> {
    constructor(db: sqlite3.Database) {
        super(db, 'V');
    }

    /**
     * Creates a new embedding.
     */
    public async create(embedding: Embedding): Promise<Embedding> {
        await this.execute(
            `INSERT INTO embeddings (id, plugin_id, dimension, entity_id, external_id, content_hash, embedding_model, embedding_vector, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                embedding.id,
                embedding.plugin_id,
                embedding.dimension,
                embedding.entity_id,
                embedding.external_id,
                embedding.content_hash,
                embedding.embedding_model,
                embedding.embedding_vector,
                embedding.created_at,
                embedding.updated_at
            ]
        );
        return embedding;
    }

    /**
     * Gets an embedding by dimension, entity_id, and model.
     */
    public async getByEntity(
        dimension: 'X' | 'Y' | 'Z' | 'W' | 'T',
        entityId: string,
        pluginId: string,
        model: string
    ): Promise<Embedding | null> {
        const row = await this.queryOne<any>(
            `SELECT * FROM embeddings 
             WHERE dimension = ? AND entity_id = ? AND plugin_id = ? AND embedding_model = ?`,
            [dimension, entityId, pluginId, model]
        );

        if (!row) {
            return null;
        }

        return this.mapRowToEmbedding(row);
    }

    /**
     * Gets all embeddings for a plugin and dimension.
     */
    public async getAllByDimension(
        dimension: 'X' | 'Y' | 'Z' | 'W' | 'T',
        pluginId: string,
        model: string
    ): Promise<Embedding[]> {
        const rows = await this.queryAll<any>(
            `SELECT * FROM embeddings 
             WHERE dimension = ? AND plugin_id = ? AND embedding_model = ?
             ORDER BY created_at DESC`,
            [dimension, pluginId, model]
        );

        return rows.map(row => this.mapRowToEmbedding(row));
    }

    /**
     * Gets embedding by content hash (for change detection).
     */
    public async getByContentHash(
        dimension: 'X' | 'Y' | 'Z' | 'W' | 'T',
        contentHash: string,
        pluginId: string,
        model: string
    ): Promise<Embedding | null> {
        const row = await this.queryOne<any>(
            `SELECT * FROM embeddings 
             WHERE dimension = ? AND content_hash = ? AND plugin_id = ? AND embedding_model = ?`,
            [dimension, contentHash, pluginId, model]
        );

        if (!row) {
            return null;
        }

        return this.mapRowToEmbedding(row);
    }

    /**
     * Updates an existing embedding.
     */
    public async update(embedding: Embedding): Promise<Embedding> {
        await this.execute(
            `UPDATE embeddings 
             SET content_hash = ?, embedding_vector = ?, updated_at = ?
             WHERE id = ? AND plugin_id = ?`,
            [
                embedding.content_hash,
                embedding.embedding_vector,
                embedding.updated_at,
                embedding.id,
                embedding.plugin_id
            ]
        );
        return embedding;
    }

    /**
     * Gets an embedding by ID.
     */
    public async getById(id: string, pluginId: string): Promise<Embedding | null> {
        const row = await this.queryOne<any>(
            `SELECT * FROM embeddings WHERE id = ? AND plugin_id = ?`,
            [id, pluginId]
        );

        if (!row) {
            return null;
        }

        return this.mapRowToEmbedding(row);
    }

    /**
     * Gets all embeddings for a plugin.
     */
    public async getAll(pluginId: string): Promise<Embedding[]> {
        const rows = await this.queryAll<any>(
            `SELECT * FROM embeddings WHERE plugin_id = ? ORDER BY created_at DESC`,
            [pluginId]
        );

        return rows.map(row => this.mapRowToEmbedding(row));
    }

    /**
     * Checks if an embedding exists.
     */
    public async exists(id: string, pluginId: string): Promise<boolean> {
        const row = await this.queryOne<{ count: number }>(
            `SELECT COUNT(*) as count FROM embeddings WHERE id = ? AND plugin_id = ?`,
            [id, pluginId]
        );
        return row !== null && row.count > 0;
    }

    /**
     * Deletes an embedding.
     */
    public async delete(id: string, pluginId: string): Promise<void> {
        await this.execute(
            `DELETE FROM embeddings WHERE id = ? AND plugin_id = ?`,
            [id, pluginId]
        );
    }

    /**
     * Maps a database row to an Embedding object.
     */
    private mapRowToEmbedding(row: any): Embedding {
        return {
            id: row.id,
            plugin_id: row.plugin_id,
            dimension: row.dimension,
            entity_id: row.entity_id,
            external_id: row.external_id,
            content_hash: row.content_hash,
            embedding_model: row.embedding_model,
            embedding_vector: Buffer.from(row.embedding_vector),
            created_at: new Date(row.created_at),
            updated_at: new Date(row.updated_at)
        };
    }
}

