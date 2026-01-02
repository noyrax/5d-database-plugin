import * as sqlite3 from 'sqlite3';
import { BaseRepositoryImpl } from './base-repository';
import { Module, ModuleSymbol } from '../models/module';
import { Dimension } from '../core/multi-db-manager';

/**
 * Repository for X-Dimension: Modules
 */
export class ModuleRepository extends BaseRepositoryImpl<Module> {
    constructor(db: sqlite3.Database) {
        super(db, 'X');
    }

    public async create(module: Module): Promise<Module> {
        await this.execute(
            `INSERT INTO modules (id, plugin_id, file_path, content_hash, content_markdown, deleted_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                module.id,
                module.plugin_id,
                module.file_path,
                module.content_hash,
                module.content_markdown,
                module.deleted_at,
                module.created_at,
                module.updated_at
            ]
        );
        return module;
    }

    public async getById(id: string, pluginId: string): Promise<Module | null> {
        const row = await this.queryOne<any>(
            `SELECT * FROM modules WHERE id = ? AND plugin_id = ?`,
            [id, pluginId]
        );

        if (!row) {
            return null;
        }

        return this.mapRowToModule(row);
    }

    public async getByFilePath(filePath: string, pluginId: string): Promise<Module | null> {
        const row = await this.queryOne<any>(
            `SELECT * FROM modules WHERE file_path = ? AND plugin_id = ?`,
            [filePath, pluginId]
        );

        if (!row) {
            return null;
        }

        return this.mapRowToModule(row);
    }

    public async update(module: Module): Promise<Module> {
        await this.execute(
            `UPDATE modules 
             SET file_path = ?, content_hash = ?, content_markdown = ?, deleted_at = ?, updated_at = ?
             WHERE id = ? AND plugin_id = ?`,
            [
                module.file_path,
                module.content_hash,
                module.content_markdown,
                module.deleted_at,
                module.updated_at,
                module.id,
                module.plugin_id
            ]
        );
        return module;
    }

    public async delete(id: string, pluginId: string): Promise<void> {
        await this.execute(
            `UPDATE modules SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND plugin_id = ?`,
            [id, pluginId]
        );
    }

    public async getAll(pluginId: string): Promise<Module[]> {
        const rows = await this.queryAll<any>(
            `SELECT * FROM modules WHERE plugin_id = ? AND deleted_at IS NULL ORDER BY file_path`,
            [pluginId]
        );

        return rows.map(row => this.mapRowToModule(row));
    }

    public async exists(id: string, pluginId: string): Promise<boolean> {
        const row = await this.queryOne<{ count: number }>(
            `SELECT COUNT(*) as count FROM modules WHERE id = ? AND plugin_id = ?`,
            [id, pluginId]
        );
        return row !== null && row.count > 0;
    }

    /**
     * Gets a module by file path.
     */
    public async findByFilePath(filePath: string, pluginId: string): Promise<Module | null> {
        return this.getByFilePath(filePath, pluginId);
    }

    /**
     * Finds a module by file path using LIKE pattern matching (for flexible path matching).
     * Returns the first match found.
     */
    public async findByFilePathLike(filePath: string, pluginId: string): Promise<Module | null> {
        // Escape special characters for LIKE
        const escapedPath = filePath.replace(/%/g, '\\%').replace(/_/g, '\\_');
        
        // Try exact match first
        const exactMatch = await this.queryOne<any>(
            `SELECT * FROM modules WHERE file_path = ? AND plugin_id = ?`,
            [filePath, pluginId]
        );
        if (exactMatch) {
            return this.mapRowToModule(exactMatch);
        }

        // Try LIKE match (contains)
        const likeMatch = await this.queryOne<any>(
            `SELECT * FROM modules WHERE file_path LIKE ? AND plugin_id = ? LIMIT 1`,
            [`%${escapedPath}%`, pluginId]
        );
        if (likeMatch) {
            return this.mapRowToModule(likeMatch);
        }

        // Try reverse LIKE match (file_path is contained in search path)
        const reverseMatch = await this.queryOne<any>(
            `SELECT * FROM modules WHERE ? LIKE '%' || file_path || '%' AND plugin_id = ? LIMIT 1`,
            [filePath, pluginId]
        );
        if (reverseMatch) {
            return this.mapRowToModule(reverseMatch);
        }

        return null;
    }

    /**
     * Gets modules by content hash (for change detection).
     */
    public async findByContentHash(contentHash: string, pluginId: string): Promise<Module[]> {
        const rows = await this.queryAll<any>(
            `SELECT * FROM modules WHERE content_hash = ? AND plugin_id = ? AND deleted_at IS NULL`,
            [contentHash, pluginId]
        );

        return rows.map(row => this.mapRowToModule(row));
    }

    /**
     * Creates a module symbol association.
     */
    public async createModuleSymbol(moduleSymbol: ModuleSymbol): Promise<ModuleSymbol> {
        await this.execute(
            `INSERT INTO module_symbols (id, module_id, symbol_external_id, symbol_name, symbol_kind)
             VALUES (?, ?, ?, ?, ?)`,
            [
                moduleSymbol.id,
                moduleSymbol.module_id,
                moduleSymbol.symbol_external_id,
                moduleSymbol.symbol_name,
                moduleSymbol.symbol_kind
            ]
        );
        return moduleSymbol;
    }

    /**
     * Gets all symbols for a module.
     */
    public async getModuleSymbols(moduleId: string): Promise<ModuleSymbol[]> {
        const rows = await this.queryAll<any>(
            `SELECT * FROM module_symbols WHERE module_id = ?`,
            [moduleId]
        );

        return rows.map(row => ({
            id: row.id,
            module_id: row.module_id,
            symbol_external_id: row.symbol_external_id,
            symbol_name: row.symbol_name,
            symbol_kind: row.symbol_kind
        }));
    }

    /**
     * Maps a database row to a Module object.
     */
    private mapRowToModule(row: any): Module {
        return {
            id: row.id,
            plugin_id: row.plugin_id,
            file_path: row.file_path,
            content_hash: row.content_hash,
            content_markdown: row.content_markdown,
            deleted_at: row.deleted_at ? new Date(row.deleted_at) : null,
            created_at: new Date(row.created_at),
            updated_at: new Date(row.updated_at)
        };
    }
}

