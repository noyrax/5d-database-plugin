import * as sqlite3 from 'sqlite3';
import { BaseRepositoryImpl } from './base-repository';
import { Dependency, DependencyGraphCache, DependencySymbolEvidence } from '../models/dependency';
import { Dimension } from '../core/multi-db-manager';

/**
 * Repository for Z-Dimension: Dependencies
 */
export class DependencyRepository extends BaseRepositoryImpl<Dependency> {
    constructor(db: sqlite3.Database) {
        super(db, 'Z');
    }

    public async create(dependency: Dependency): Promise<Dependency> {
        await this.execute(
            `INSERT INTO dependencies (id, plugin_id, from_module, to_module, dependency_type, symbols_json, content_hash, is_type_only, is_reexport, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                dependency.id,
                dependency.plugin_id,
                dependency.from_module,
                dependency.to_module,
                dependency.dependency_type,
                dependency.symbols_json,
                dependency.content_hash,
                dependency.is_type_only ? 1 : 0,
                dependency.is_reexport ? 1 : 0,
                dependency.created_at,
                dependency.updated_at
            ]
        );
        return dependency;
    }

    public async getById(id: string, pluginId: string): Promise<Dependency | null> {
        const row = await this.queryOne<any>(
            `SELECT * FROM dependencies WHERE id = ? AND plugin_id = ?`,
            [id, pluginId]
        );

        if (!row) {
            return null;
        }

        return this.mapRowToDependency(row);
    }

    public async update(dependency: Dependency): Promise<Dependency> {
        await this.execute(
            `UPDATE dependencies 
             SET from_module = ?, to_module = ?, dependency_type = ?, symbols_json = ?, content_hash = ?, is_type_only = ?, is_reexport = ?, updated_at = ?
             WHERE id = ? AND plugin_id = ?`,
            [
                dependency.from_module,
                dependency.to_module,
                dependency.dependency_type,
                dependency.symbols_json,
                dependency.content_hash,
                dependency.is_type_only ? 1 : 0,
                dependency.is_reexport ? 1 : 0,
                dependency.updated_at,
                dependency.id,
                dependency.plugin_id
            ]
        );
        return dependency;
    }

    public async delete(id: string, pluginId: string): Promise<void> {
        await this.execute(
            `DELETE FROM dependencies WHERE id = ? AND plugin_id = ?`,
            [id, pluginId]
        );
    }

    public async getAll(pluginId: string): Promise<Dependency[]> {
        const rows = await this.queryAll<any>(
            `SELECT * FROM dependencies WHERE plugin_id = ? ORDER BY from_module, to_module`,
            [pluginId]
        );

        return rows.map(row => this.mapRowToDependency(row));
    }

    public async exists(id: string, pluginId: string): Promise<boolean> {
        const row = await this.queryOne<{ count: number }>(
            `SELECT COUNT(*) as count FROM dependencies WHERE id = ? AND plugin_id = ?`,
            [id, pluginId]
        );
        return row !== null && row.count > 0;
    }

    /**
     * Gets dependencies by from_module.
     */
    public async findByFromModule(fromModule: string, pluginId: string): Promise<Dependency[]> {
        const rows = await this.queryAll<any>(
            `SELECT * FROM dependencies WHERE from_module = ? AND plugin_id = ?`,
            [fromModule, pluginId]
        );

        return rows.map(row => this.mapRowToDependency(row));
    }

    /**
     * Gets dependencies by to_module.
     */
    public async findByToModule(toModule: string, pluginId: string): Promise<Dependency[]> {
        const rows = await this.queryAll<any>(
            `SELECT * FROM dependencies WHERE to_module = ? AND plugin_id = ?`,
            [toModule, pluginId]
        );

        return rows.map(row => this.mapRowToDependency(row));
    }

    /**
     * Gets the dependency graph cache.
     */
    public async getDependencyGraphCache(pluginId: string): Promise<DependencyGraphCache | null> {
        const row = await this.queryOne<any>(
            `SELECT * FROM dependency_graph_cache WHERE plugin_id = ?`,
            [pluginId]
        );

        if (!row) {
            return null;
        }

        return {
            id: row.id,
            plugin_id: row.plugin_id,
            mermaid_graph: row.mermaid_graph,
            generated_at: new Date(row.generated_at)
        };
    }

    /**
     * Sets the dependency graph cache.
     */
    public async setDependencyGraphCache(cache: DependencyGraphCache): Promise<DependencyGraphCache> {
        await this.execute(
            `INSERT OR REPLACE INTO dependency_graph_cache (id, plugin_id, mermaid_graph, generated_at)
             VALUES (?, ?, ?, ?)`,
            [cache.id, cache.plugin_id, cache.mermaid_graph, cache.generated_at]
        );
        return cache;
    }

    /**
     * Creates a dependency symbol evidence link.
     */
    public async createDependencySymbolEvidence(evidence: DependencySymbolEvidence): Promise<DependencySymbolEvidence> {
        await this.execute(
            `INSERT INTO dependency_symbol_evidence (id, dependency_id, symbol_dependency_id)
             VALUES (?, ?, ?)`,
            [evidence.id, evidence.dependency_id, evidence.symbol_dependency_id]
        );
        return evidence;
    }

    /**
     * Maps a database row to a Dependency object.
     */
    private mapRowToDependency(row: any): Dependency {
        return {
            id: row.id,
            plugin_id: row.plugin_id,
            from_module: row.from_module,
            to_module: row.to_module,
            dependency_type: row.dependency_type,
            symbols_json: row.symbols_json,
            content_hash: row.content_hash,
            is_type_only: row.is_type_only === 1,
            is_reexport: row.is_reexport === 1,
            created_at: new Date(row.created_at),
            updated_at: new Date(row.updated_at)
        };
    }
}

