import * as sqlite3 from 'sqlite3';
import { MultiDbManager, Dimension } from './multi-db-manager';

/**
 * ID mapping record for external to internal ID translation
 */
export interface IdMapping {
    internal_id: string;
    external_id: string;
    plugin_id: string;
}

/**
 * Manages ID mappings between external IDs (from documentation) and internal DB IDs (UUIDs).
 * Each dimension has its own ID mapping table.
 */
export class IdMapper {
    private dbManager: MultiDbManager;

    /**
     * Creates a new IdMapper instance.
     * 
     * @param dbManager The MultiDbManager instance
     */
    constructor(dbManager: MultiDbManager) {
        this.dbManager = dbManager;
    }

    /**
     * Gets the table name for ID mappings for a dimension.
     * 
     * @param dimension The dimension
     * @returns The table name
     */
    private getMappingTableName(dimension: Dimension): string {
        const tableNames: Record<Dimension, string> = {
            X: 'module_id_mapping',
            Y: 'symbol_id_mapping',
            Z: 'dependency_id_mapping',
            W: 'adr_id_mapping',
            T: 'change_id_mapping',
            V: 'vector_id_mapping'  // V-dimension doesn't use ID mapping, but included for completeness
        };
        return tableNames[dimension];
    }

    /**
     * Maps an external ID to an internal ID for a dimension.
     * If the mapping doesn't exist, creates a new one.
     * 
     * @param dimension The dimension
     * @param externalId The external ID (e.g., symbol_id from JSONL, adr_number)
     * @param internalId The internal UUID
     * @param pluginId The plugin ID
     * @returns Promise that resolves when the mapping is stored
     */
    public async setMapping(
        dimension: Dimension,
        externalId: string,
        internalId: string,
        pluginId: string
    ): Promise<void> {
        const db = await this.dbManager.getDatabase(dimension);
        const tableName = this.getMappingTableName(dimension);

        return new Promise((resolve, reject) => {
            db.run(
                `INSERT OR REPLACE INTO ${tableName} (internal_id, external_id, plugin_id) VALUES (?, ?, ?)`,
                [internalId, externalId, pluginId],
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
     * Gets the internal ID for an external ID.
     * 
     * @param dimension The dimension
     * @param externalId The external ID
     * @param pluginId The plugin ID
     * @returns Promise that resolves to the internal ID, or null if not found
     */
    public async getInternalId(
        dimension: Dimension,
        externalId: string,
        pluginId: string
    ): Promise<string | null> {
        const db = await this.dbManager.getDatabase(dimension);
        const tableName = this.getMappingTableName(dimension);

        return new Promise((resolve, reject) => {
            db.get(
                `SELECT internal_id FROM ${tableName} WHERE external_id = ? AND plugin_id = ?`,
                [externalId, pluginId],
                (err, row: { internal_id: string } | undefined) => {
                    if (err) {
                        reject(err);
                    } else if (row) {
                        resolve(row.internal_id);
                    } else {
                        resolve(null);
                    }
                }
            );
        });
    }

    /**
     * Gets the external ID for an internal ID.
     * 
     * @param dimension The dimension
     * @param internalId The internal UUID
     * @param pluginId The plugin ID
     * @returns Promise that resolves to the external ID, or null if not found
     */
    public async getExternalId(
        dimension: Dimension,
        internalId: string,
        pluginId: string
    ): Promise<string | null> {
        const db = await this.dbManager.getDatabase(dimension);
        const tableName = this.getMappingTableName(dimension);

        return new Promise((resolve, reject) => {
            db.get(
                `SELECT external_id FROM ${tableName} WHERE internal_id = ? AND plugin_id = ?`,
                [internalId, pluginId],
                (err, row: { external_id: string } | undefined) => {
                    if (err) {
                        reject(err);
                    } else if (row) {
                        resolve(row.external_id);
                    } else {
                        resolve(null);
                    }
                }
            );
        });
    }

    /**
     * Deletes a mapping for an external ID.
     * 
     * @param dimension The dimension
     * @param externalId The external ID
     * @param pluginId The plugin ID
     * @returns Promise that resolves when the mapping is deleted
     */
    public async deleteMapping(
        dimension: Dimension,
        externalId: string,
        pluginId: string
    ): Promise<void> {
        const db = await this.dbManager.getDatabase(dimension);
        const tableName = this.getMappingTableName(dimension);

        return new Promise((resolve, reject) => {
            db.run(
                `DELETE FROM ${tableName} WHERE external_id = ? AND plugin_id = ?`,
                [externalId, pluginId],
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
}

