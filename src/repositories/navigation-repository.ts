import * as sqlite3 from 'sqlite3';
import { BaseRepositoryImpl } from './base-repository';
import { Dimension } from '../core/multi-db-manager';

/**
 * Navigation metadata model for V-Dimension
 */
export interface NavigationMetadata {
    id: string;  // Internal UUID
    plugin_id: string;
    dimension: 'X' | 'Y' | 'Z' | 'W' | 'T';
    entity_id: string;
    is_entry_point: boolean;
    cluster_id: string | null;  // Grouping of related entities
    related_adrs: string;  // JSON Array of ADR numbers
    importance_rank: number | null;
    created_at: Date;
}

/**
 * Entry point model for V-Dimension
 */
export interface EntryPoint {
    id: string;  // Internal UUID
    plugin_id: string;
    dimension: 'X' | 'Y' | 'Z' | 'W' | 'T';
    entity_id: string;
    priority: number;  // Higher = more important
    reason: string | null;  // Why is this an entry point?
    created_at: Date;
}

/**
 * Repository for V-Dimension: Navigation Metadata
 */
export class NavigationRepository extends BaseRepositoryImpl<NavigationMetadata> {
    constructor(db: sqlite3.Database) {
        super(db, 'V');
    }

    /**
     * Creates or updates navigation metadata.
     */
    public async upsert(metadata: NavigationMetadata): Promise<void> {
        await this.execute(
            `INSERT INTO navigation_metadata (id, plugin_id, dimension, entity_id, is_entry_point, cluster_id, related_adrs, importance_rank, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(plugin_id, dimension, entity_id) 
             DO UPDATE SET 
                is_entry_point = excluded.is_entry_point,
                cluster_id = excluded.cluster_id,
                related_adrs = excluded.related_adrs,
                importance_rank = excluded.importance_rank`,
            [
                metadata.id,
                metadata.plugin_id,
                metadata.dimension,
                metadata.entity_id,
                metadata.is_entry_point ? 1 : 0,
                metadata.cluster_id,
                metadata.related_adrs,
                metadata.importance_rank,
                metadata.created_at
            ]
        );
    }

    /**
     * Gets navigation metadata for an entity.
     */
    public async getByEntity(
        dimension: 'X' | 'Y' | 'Z' | 'W' | 'T',
        entityId: string,
        pluginId: string
    ): Promise<NavigationMetadata | null> {
        const row = await this.queryOne<any>(
            `SELECT * FROM navigation_metadata 
             WHERE dimension = ? AND entity_id = ? AND plugin_id = ?`,
            [dimension, entityId, pluginId]
        );

        if (!row) {
            return null;
        }

        return this.mapRowToMetadata(row);
    }

    /**
     * Gets all entry points for a dimension.
     */
    public async getEntryPoints(
        dimension: 'X' | 'Y' | 'Z' | 'W' | 'T',
        pluginId: string
    ): Promise<NavigationMetadata[]> {
        const rows = await this.queryAll<any>(
            `SELECT * FROM navigation_metadata 
             WHERE dimension = ? AND plugin_id = ? AND is_entry_point = 1
             ORDER BY importance_rank ASC NULLS LAST`,
            [dimension, pluginId]
        );

        return rows.map(row => this.mapRowToMetadata(row));
    }

    /**
     * Creates a new navigation metadata.
     */
    public async create(metadata: NavigationMetadata): Promise<NavigationMetadata> {
        await this.upsert(metadata);
        return metadata;
    }

    /**
     * Gets navigation metadata by ID.
     */
    public async getById(id: string, pluginId: string): Promise<NavigationMetadata | null> {
        const row = await this.queryOne<any>(
            `SELECT * FROM navigation_metadata WHERE id = ? AND plugin_id = ?`,
            [id, pluginId]
        );

        if (!row) {
            return null;
        }

        return this.mapRowToMetadata(row);
    }

    /**
     * Updates an existing navigation metadata.
     */
    public async update(metadata: NavigationMetadata): Promise<NavigationMetadata> {
        await this.upsert(metadata);
        return metadata;
    }

    /**
     * Deletes navigation metadata.
     */
    public async delete(id: string, pluginId: string): Promise<void> {
        await this.execute(
            `DELETE FROM navigation_metadata WHERE id = ? AND plugin_id = ?`,
            [id, pluginId]
        );
    }

    /**
     * Gets all navigation metadata for a plugin.
     */
    public async getAll(pluginId: string): Promise<NavigationMetadata[]> {
        const rows = await this.queryAll<any>(
            `SELECT * FROM navigation_metadata WHERE plugin_id = ? ORDER BY created_at DESC`,
            [pluginId]
        );

        return rows.map(row => this.mapRowToMetadata(row));
    }

    /**
     * Checks if navigation metadata exists.
     */
    public async exists(id: string, pluginId: string): Promise<boolean> {
        const row = await this.queryOne<{ count: number }>(
            `SELECT COUNT(*) as count FROM navigation_metadata WHERE id = ? AND plugin_id = ?`,
            [id, pluginId]
        );
        return row !== null && row.count > 0;
    }

    /**
     * Maps a database row to a NavigationMetadata object.
     */
    private mapRowToMetadata(row: any): NavigationMetadata {
        return {
            id: row.id,
            plugin_id: row.plugin_id,
            dimension: row.dimension,
            entity_id: row.entity_id,
            is_entry_point: row.is_entry_point === 1,
            cluster_id: row.cluster_id,
            related_adrs: row.related_adrs,
            importance_rank: row.importance_rank,
            created_at: new Date(row.created_at)
        };
    }
}

/**
 * Repository for V-Dimension: Entry Points (manual overrides)
 */
export class EntryPointRepository extends BaseRepositoryImpl<EntryPoint> {
    constructor(db: sqlite3.Database) {
        super(db, 'V');
    }

    /**
     * Creates or updates an entry point.
     */
    public async upsert(entryPoint: EntryPoint): Promise<void> {
        await this.execute(
            `INSERT INTO entry_points (id, plugin_id, dimension, entity_id, priority, reason, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(plugin_id, dimension, entity_id) 
             DO UPDATE SET 
                priority = excluded.priority,
                reason = excluded.reason`,
            [
                entryPoint.id,
                entryPoint.plugin_id,
                entryPoint.dimension,
                entryPoint.entity_id,
                entryPoint.priority,
                entryPoint.reason,
                entryPoint.created_at
            ]
        );
    }

    /**
     * Gets all entry points for a dimension.
     */
    public async getAllByDimension(
        dimension: 'X' | 'Y' | 'Z' | 'W' | 'T',
        pluginId: string
    ): Promise<EntryPoint[]> {
        const rows = await this.queryAll<any>(
            `SELECT * FROM entry_points 
             WHERE dimension = ? AND plugin_id = ?
             ORDER BY priority DESC`,
            [dimension, pluginId]
        );

        return rows.map(row => this.mapRowToEntryPoint(row));
    }

    /**
     * Creates a new entry point.
     */
    public async create(entryPoint: EntryPoint): Promise<EntryPoint> {
        await this.upsert(entryPoint);
        return entryPoint;
    }

    /**
     * Gets an entry point by ID.
     */
    public async getById(id: string, pluginId: string): Promise<EntryPoint | null> {
        const row = await this.queryOne<any>(
            `SELECT * FROM entry_points WHERE id = ? AND plugin_id = ?`,
            [id, pluginId]
        );

        if (!row) {
            return null;
        }

        return this.mapRowToEntryPoint(row);
    }

    /**
     * Updates an existing entry point.
     */
    public async update(entryPoint: EntryPoint): Promise<EntryPoint> {
        await this.upsert(entryPoint);
        return entryPoint;
    }

    /**
     * Deletes an entry point.
     */
    public async delete(id: string, pluginId: string): Promise<void> {
        await this.execute(
            `DELETE FROM entry_points WHERE id = ? AND plugin_id = ?`,
            [id, pluginId]
        );
    }

    /**
     * Gets all entry points for a plugin.
     */
    public async getAll(pluginId: string): Promise<EntryPoint[]> {
        return this.getAllByDimension('X', pluginId); // Default to X-dimension
    }

    /**
     * Checks if an entry point exists.
     */
    public async exists(id: string, pluginId: string): Promise<boolean> {
        const row = await this.queryOne<{ count: number }>(
            `SELECT COUNT(*) as count FROM entry_points WHERE id = ? AND plugin_id = ?`,
            [id, pluginId]
        );
        return row !== null && row.count > 0;
    }

    /**
     * Maps a database row to an EntryPoint object.
     */
    private mapRowToEntryPoint(row: any): EntryPoint {
        return {
            id: row.id,
            plugin_id: row.plugin_id,
            dimension: row.dimension,
            entity_id: row.entity_id,
            priority: row.priority,
            reason: row.reason,
            created_at: new Date(row.created_at)
        };
    }
}

