import * as sqlite3 from 'sqlite3';
import { BaseRepositoryImpl } from './base-repository';
import { Adr, AdrFileMapping } from '../models/adr';
import { Dimension } from '../core/multi-db-manager';

/**
 * Repository for W-Dimension: ADRs
 */
export class AdrRepository extends BaseRepositoryImpl<Adr> {
    constructor(db: sqlite3.Database) {
        super(db, 'W');
    }

    public async create(adr: Adr): Promise<Adr> {
        await this.execute(
            `INSERT INTO adrs (id, plugin_id, adr_number, title, file_name, content_markdown, content_hash, deleted_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                adr.id,
                adr.plugin_id,
                adr.adr_number,
                adr.title,
                adr.file_name,
                adr.content_markdown,
                adr.content_hash,
                adr.deleted_at,
                adr.created_at,
                adr.updated_at
            ]
        );
        return adr;
    }

    public async getById(id: string, pluginId: string): Promise<Adr | null> {
        const row = await this.queryOne<any>(
            `SELECT * FROM adrs WHERE id = ? AND plugin_id = ?`,
            [id, pluginId]
        );

        if (!row) {
            return null;
        }

        return this.mapRowToAdr(row);
    }

    public async getByAdrNumber(adrNumber: string, pluginId: string): Promise<Adr | null> {
        const row = await this.queryOne<any>(
            `SELECT * FROM adrs WHERE adr_number = ? AND plugin_id = ?`,
            [adrNumber, pluginId]
        );

        if (!row) {
            return null;
        }

        return this.mapRowToAdr(row);
    }

    public async update(adr: Adr): Promise<Adr> {
        await this.execute(
            `UPDATE adrs 
             SET title = ?, file_name = ?, content_markdown = ?, content_hash = ?, deleted_at = ?, updated_at = ?
             WHERE id = ? AND plugin_id = ?`,
            [
                adr.title,
                adr.file_name,
                adr.content_markdown,
                adr.content_hash,
                adr.deleted_at,
                adr.updated_at,
                adr.id,
                adr.plugin_id
            ]
        );
        return adr;
    }

    public async delete(id: string, pluginId: string): Promise<void> {
        await this.execute(
            `UPDATE adrs SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND plugin_id = ?`,
            [id, pluginId]
        );
    }

    public async getAll(pluginId: string): Promise<Adr[]> {
        const rows = await this.queryAll<any>(
            `SELECT * FROM adrs WHERE plugin_id = ? AND deleted_at IS NULL ORDER BY adr_number`,
            [pluginId]
        );

        return rows.map(row => this.mapRowToAdr(row));
    }

    public async exists(id: string, pluginId: string): Promise<boolean> {
        const row = await this.queryOne<{ count: number }>(
            `SELECT COUNT(*) as count FROM adrs WHERE id = ? AND plugin_id = ?`,
            [id, pluginId]
        );
        return row !== null && row.count > 0;
    }

    /**
     * Gets ADRs by content hash (for change detection).
     */
    public async findByContentHash(contentHash: string, pluginId: string): Promise<Adr[]> {
        const rows = await this.queryAll<any>(
            `SELECT * FROM adrs WHERE content_hash = ? AND plugin_id = ? AND deleted_at IS NULL`,
            [contentHash, pluginId]
        );

        return rows.map(row => this.mapRowToAdr(row));
    }

    /**
     * Creates an ADR file mapping.
     */
    public async createAdrFileMapping(mapping: AdrFileMapping): Promise<AdrFileMapping> {
        await this.execute(
            `INSERT INTO adr_file_mappings (id, adr_id, file_path)
             VALUES (?, ?, ?)`,
            [mapping.id, mapping.adr_id, mapping.file_path]
        );
        return mapping;
    }

    /**
     * Gets all file mappings for an ADR.
     */
    public async getAdrFileMappings(adrId: string): Promise<AdrFileMapping[]> {
        const rows = await this.queryAll<any>(
            `SELECT * FROM adr_file_mappings WHERE adr_id = ?`,
            [adrId]
        );

        return rows.map(row => ({
            id: row.id,
            adr_id: row.adr_id,
            file_path: row.file_path
        }));
    }

    /**
     * Deletes an ADR file mapping by ID.
     */
    public async deleteAdrFileMapping(mappingId: string): Promise<void> {
        await this.execute(
            `DELETE FROM adr_file_mappings WHERE id = ?`,
            [mappingId]
        );
    }

    /**
     * Gets ADRs by file path.
     */
    public async findByFilePath(filePath: string, pluginId: string): Promise<Adr[]> {
        const rows = await this.queryAll<any>(
            `SELECT a.* FROM adrs a
             JOIN adr_file_mappings afm ON a.id = afm.adr_id
             WHERE afm.file_path = ? AND a.plugin_id = ? AND a.deleted_at IS NULL
             ORDER BY a.adr_number`,
            [filePath, pluginId]
        );

        return rows.map(row => this.mapRowToAdr(row));
    }

    /**
     * Maps a database row to an Adr object.
     */
    private mapRowToAdr(row: any): Adr {
        return {
            id: row.id,
            plugin_id: row.plugin_id,
            adr_number: row.adr_number,
            title: row.title,
            file_name: row.file_name,
            content_markdown: row.content_markdown,
            content_hash: row.content_hash,
            deleted_at: row.deleted_at ? new Date(row.deleted_at) : null,
            created_at: new Date(row.created_at),
            updated_at: new Date(row.updated_at)
        };
    }
}

