import * as sqlite3 from 'sqlite3';
import { BaseRepositoryImpl } from './base-repository';
import { Dimension } from '../core/multi-db-manager';

/**
 * Importance score model for V-Dimension
 */
export interface ImportanceScore {
    id: string;  // Internal UUID
    plugin_id: string;
    dimension: 'X' | 'Y' | 'Z' | 'W' | 'T';
    entity_id: string;
    pagerank_score: number;
    betweenness_score: number;
    combined_score: number;  // Weighted combination
    rank: number;  // Ranking (1 = most important)
    created_at: Date;
}

/**
 * Repository for V-Dimension: Importance Scores
 */
export class ImportanceRepository extends BaseRepositoryImpl<ImportanceScore> {
    constructor(db: sqlite3.Database) {
        super(db, 'V');
    }

    /**
     * Creates or updates an importance score.
     */
    public async upsert(score: ImportanceScore): Promise<void> {
        await this.execute(
            `INSERT INTO importance_scores (id, plugin_id, dimension, entity_id, pagerank_score, betweenness_score, combined_score, rank, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(plugin_id, dimension, entity_id) 
             DO UPDATE SET 
                pagerank_score = excluded.pagerank_score,
                betweenness_score = excluded.betweenness_score,
                combined_score = excluded.combined_score,
                rank = excluded.rank`,
            [
                score.id,
                score.plugin_id,
                score.dimension,
                score.entity_id,
                score.pagerank_score,
                score.betweenness_score,
                score.combined_score,
                score.rank,
                score.created_at
            ]
        );
    }

    /**
     * Gets importance score for an entity.
     */
    public async getByEntity(
        dimension: 'X' | 'Y' | 'Z' | 'W' | 'T',
        entityId: string,
        pluginId: string
    ): Promise<ImportanceScore | null> {
        const row = await this.queryOne<any>(
            `SELECT * FROM importance_scores 
             WHERE dimension = ? AND entity_id = ? AND plugin_id = ?`,
            [dimension, entityId, pluginId]
        );

        if (!row) {
            return null;
        }

        return this.mapRowToScore(row);
    }

    /**
     * Gets all importance scores for a dimension, sorted by rank.
     */
    public async getAllByDimension(
        dimension: 'X' | 'Y' | 'Z' | 'W' | 'T',
        pluginId: string
    ): Promise<ImportanceScore[]> {
        const rows = await this.queryAll<any>(
            `SELECT * FROM importance_scores 
             WHERE dimension = ? AND plugin_id = ?
             ORDER BY rank ASC`,
            [dimension, pluginId]
        );

        return rows.map(row => this.mapRowToScore(row));
    }

    /**
     * Creates a new importance score.
     */
    public async create(score: ImportanceScore): Promise<ImportanceScore> {
        await this.upsert(score);
        return score;
    }

    /**
     * Gets an importance score by ID.
     */
    public async getById(id: string, pluginId: string): Promise<ImportanceScore | null> {
        const row = await this.queryOne<any>(
            `SELECT * FROM importance_scores WHERE id = ? AND plugin_id = ?`,
            [id, pluginId]
        );

        if (!row) {
            return null;
        }

        return this.mapRowToScore(row);
    }

    /**
     * Updates an existing importance score.
     */
    public async update(score: ImportanceScore): Promise<ImportanceScore> {
        await this.upsert(score);
        return score;
    }

    /**
     * Deletes an importance score.
     */
    public async delete(id: string, pluginId: string): Promise<void> {
        await this.execute(
            `DELETE FROM importance_scores WHERE id = ? AND plugin_id = ?`,
            [id, pluginId]
        );
    }

    /**
     * Gets all importance scores for a plugin.
     */
    public async getAll(pluginId: string): Promise<ImportanceScore[]> {
        const rows = await this.queryAll<any>(
            `SELECT * FROM importance_scores WHERE plugin_id = ? ORDER BY rank ASC`,
            [pluginId]
        );

        return rows.map(row => this.mapRowToScore(row));
    }

    /**
     * Checks if an importance score exists.
     */
    public async exists(id: string, pluginId: string): Promise<boolean> {
        const row = await this.queryOne<{ count: number }>(
            `SELECT COUNT(*) as count FROM importance_scores WHERE id = ? AND plugin_id = ?`,
            [id, pluginId]
        );
        return row !== null && row.count > 0;
    }

    /**
     * Maps a database row to an ImportanceScore object.
     */
    private mapRowToScore(row: any): ImportanceScore {
        return {
            id: row.id,
            plugin_id: row.plugin_id,
            dimension: row.dimension,
            entity_id: row.entity_id,
            pagerank_score: row.pagerank_score,
            betweenness_score: row.betweenness_score,
            combined_score: row.combined_score,
            rank: row.rank,
            created_at: new Date(row.created_at)
        };
    }
}

