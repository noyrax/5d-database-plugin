import * as sqlite3 from 'sqlite3';
import { BaseRepositoryImpl } from './base-repository';
import { Symbol, SymbolDependency } from '../models/symbol';
import { Dimension } from '../core/multi-db-manager';

/**
 * Repository for Y-Dimension: Symbols
 */
export class SymbolRepository extends BaseRepositoryImpl<Symbol> {
    constructor(db: sqlite3.Database) {
        super(db, 'Y');
    }

    public async create(symbol: Symbol): Promise<Symbol> {
        await this.execute(
            `INSERT INTO symbols (id, plugin_id, symbol_id, path, kind, name, signature_json, signature_hash, summary, deleted_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                symbol.id,
                symbol.plugin_id,
                symbol.symbol_id,
                symbol.path,
                symbol.kind,
                symbol.name,
                symbol.signature_json,
                symbol.signature_hash,
                symbol.summary,
                symbol.deleted_at,
                symbol.created_at,
                symbol.updated_at
            ]
        );
        return symbol;
    }

    public async getById(id: string, pluginId: string): Promise<Symbol | null> {
        const row = await this.queryOne<any>(
            `SELECT * FROM symbols WHERE id = ? AND plugin_id = ?`,
            [id, pluginId]
        );

        if (!row) {
            return null;
        }

        return this.mapRowToSymbol(row);
    }

    public async getBySymbolId(symbolId: string, pluginId: string): Promise<Symbol | null> {
        const row = await this.queryOne<any>(
            `SELECT * FROM symbols WHERE symbol_id = ? AND plugin_id = ?`,
            [symbolId, pluginId]
        );

        if (!row) {
            return null;
        }

        return this.mapRowToSymbol(row);
    }

    public async update(symbol: Symbol): Promise<Symbol> {
        await this.execute(
            `UPDATE symbols 
             SET path = ?, kind = ?, name = ?, signature_json = ?, signature_hash = ?, summary = ?, deleted_at = ?, updated_at = ?
             WHERE id = ? AND plugin_id = ?`,
            [
                symbol.path,
                symbol.kind,
                symbol.name,
                symbol.signature_json,
                symbol.signature_hash,
                symbol.summary,
                symbol.deleted_at,
                symbol.updated_at,
                symbol.id,
                symbol.plugin_id
            ]
        );
        return symbol;
    }

    public async delete(id: string, pluginId: string): Promise<void> {
        await this.execute(
            `UPDATE symbols SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND plugin_id = ?`,
            [id, pluginId]
        );
    }

    public async getAll(pluginId: string): Promise<Symbol[]> {
        const rows = await this.queryAll<any>(
            `SELECT * FROM symbols WHERE plugin_id = ? AND deleted_at IS NULL ORDER BY path, name`,
            [pluginId]
        );

        return rows.map(row => this.mapRowToSymbol(row));
    }

    public async exists(id: string, pluginId: string): Promise<boolean> {
        const row = await this.queryOne<{ count: number }>(
            `SELECT COUNT(*) as count FROM symbols WHERE id = ? AND plugin_id = ?`,
            [id, pluginId]
        );
        return row !== null && row.count > 0;
    }

    /**
     * Gets symbols by file path.
     */
    public async findByPath(path: string, pluginId: string): Promise<Symbol[]> {
        const rows = await this.queryAll<any>(
            `SELECT * FROM symbols WHERE path = ? AND plugin_id = ? AND deleted_at IS NULL`,
            [path, pluginId]
        );

        return rows.map(row => this.mapRowToSymbol(row));
    }

    /**
     * Gets symbols by signature hash (for change detection).
     */
    public async findBySignatureHash(signatureHash: string, pluginId: string): Promise<Symbol[]> {
        const rows = await this.queryAll<any>(
            `SELECT * FROM symbols WHERE signature_hash = ? AND plugin_id = ? AND deleted_at IS NULL`,
            [signatureHash, pluginId]
        );

        return rows.map(row => this.mapRowToSymbol(row));
    }

    /**
     * Creates a symbol dependency.
     */
    public async createSymbolDependency(dependency: SymbolDependency): Promise<SymbolDependency> {
        await this.execute(
            `INSERT INTO symbol_dependencies (id, symbol_id, dependency_module, dependency_symbols_json, is_type_only, is_reexport)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                dependency.id,
                dependency.symbol_id,
                dependency.dependency_module,
                dependency.dependency_symbols_json,
                dependency.is_type_only ? 1 : 0,
                dependency.is_reexport ? 1 : 0
            ]
        );
        return dependency;
    }

    /**
     * Gets all dependencies for a symbol.
     */
    public async getSymbolDependencies(symbolId: string): Promise<SymbolDependency[]> {
        const rows = await this.queryAll<any>(
            `SELECT * FROM symbol_dependencies WHERE symbol_id = ?`,
            [symbolId]
        );

        return rows.map(row => ({
            id: row.id,
            symbol_id: row.symbol_id,
            dependency_module: row.dependency_module,
            dependency_symbols_json: row.dependency_symbols_json,
            is_type_only: row.is_type_only === 1,
            is_reexport: row.is_reexport === 1
        }));
    }

    /**
     * Maps a database row to a Symbol object.
     */
    private mapRowToSymbol(row: any): Symbol {
        return {
            id: row.id,
            plugin_id: row.plugin_id,
            symbol_id: row.symbol_id,
            path: row.path,
            kind: row.kind,
            name: row.name,
            signature_json: row.signature_json,
            signature_hash: row.signature_hash,
            summary: row.summary,
            deleted_at: row.deleted_at ? new Date(row.deleted_at) : null,
            created_at: new Date(row.created_at),
            updated_at: new Date(row.updated_at)
        };
    }
}

