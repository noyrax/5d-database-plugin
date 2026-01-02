import { MultiDbManager } from '../core/multi-db-manager';
import { ModuleApi } from './module-api';
import { SymbolApi } from './symbol-api';
import { AdrApi } from './adr-api';
import { DependencyApi } from './dependency-api';
import { ChangeApi } from './change-api';

/**
 * Search result interface.
 */
export interface SearchResult {
    dimension: 'X' | 'Y' | 'Z' | 'W' | 'T';
    id: string;
    label: string;
    description?: string;
    filePath?: string;
    metadata?: Record<string, string>;
}

/**
 * Search options.
 */
export interface SearchOptions {
    limit?: number;
    caseSensitive?: boolean;
}

/**
 * API for keyword search across all 5 dimensions.
 */
export class SearchApi {
    private dbManager: MultiDbManager;
    private moduleApi: ModuleApi;
    private symbolApi: SymbolApi;
    private adrApi: AdrApi;
    private dependencyApi: DependencyApi;
    private changeApi: ChangeApi;

    constructor(dbManager: MultiDbManager) {
        this.dbManager = dbManager;
        this.moduleApi = new ModuleApi(dbManager);
        this.symbolApi = new SymbolApi(dbManager);
        this.adrApi = new AdrApi(dbManager);
        this.dependencyApi = new DependencyApi(dbManager);
        this.changeApi = new ChangeApi(dbManager);
    }

    /**
     * Searches across all dimensions.
     */
    public async searchAll(query: string, pluginId: string, options: SearchOptions = {}): Promise<SearchResult[]> {
        const limit = options.limit || 20;
        const caseSensitive = options.caseSensitive || false;
        
        const results: SearchResult[] = [];
        
        // Search in parallel across all dimensions
        const [modules, symbols, adrs, dependencies, changes] = await Promise.all([
            this.searchModules(query, pluginId, limit, caseSensitive),
            this.searchSymbols(query, pluginId, limit, caseSensitive),
            this.searchAdrs(query, pluginId, limit, caseSensitive),
            this.searchDependencies(query, pluginId, limit, caseSensitive),
            this.searchChanges(query, pluginId, limit, caseSensitive)
        ]);
        
        results.push(...modules, ...symbols, ...adrs, ...dependencies, ...changes);
        
        // Sort by relevance (exact matches first, then by dimension)
        return this.sortByRelevance(results, query);
    }

    /**
     * Searches in X-Dimension (Modules).
     */
    private async searchModules(query: string, pluginId: string, limit: number, caseSensitive: boolean): Promise<SearchResult[]> {
        const db = await this.dbManager.getDatabase('X');
        
        const searchPattern = caseSensitive ? `%${query}%` : `%${query.toLowerCase()}%`;
        const exactPattern = caseSensitive ? `%${query}%` : `%${query.toLowerCase()}%`;
        
        const rows = await this.queryDatabase<any>(
            db,
            `SELECT * FROM modules 
             WHERE plugin_id = ? 
             AND deleted_at IS NULL
             AND (
                 ${caseSensitive ? 'file_path LIKE ?' : 'LOWER(file_path) LIKE ?'}
                 OR ${caseSensitive ? 'content_markdown LIKE ?' : 'LOWER(content_markdown) LIKE ?'}
             )
             ORDER BY 
                 CASE WHEN ${caseSensitive ? 'file_path' : 'LOWER(file_path)'} LIKE ? THEN 1 ELSE 2 END,
                 file_path
             LIMIT ?`,
            caseSensitive
                ? [pluginId, searchPattern, searchPattern, exactPattern, limit]
                : [pluginId, searchPattern, searchPattern, exactPattern, limit]
        );
        
        return rows.map((row: any) => ({
            dimension: 'X' as const,
            id: row.id,
            label: row.file_path,
            description: `Module: ${row.file_path}`,
            filePath: row.file_path,
            metadata: {
                contentHash: row.content_hash,
                createdAt: row.created_at
            }
        }));
    }

    /**
     * Searches in Y-Dimension (Symbols).
     */
    private async searchSymbols(query: string, pluginId: string, limit: number, caseSensitive: boolean): Promise<SearchResult[]> {
        const db = await this.dbManager.getDatabase('Y');
        
        const searchPattern = caseSensitive ? `%${query}%` : `%${query.toLowerCase()}%`;
        const exactPattern = caseSensitive ? `%${query}%` : `%${query.toLowerCase()}%`;
        
        const rows = await this.queryDatabase<any>(
            db,
            `SELECT * FROM symbols 
             WHERE plugin_id = ? 
             AND deleted_at IS NULL
             AND (
                 ${caseSensitive ? 'name LIKE ?' : 'LOWER(name) LIKE ?'}
                 OR ${caseSensitive ? 'path LIKE ?' : 'LOWER(path) LIKE ?'}
                 OR (summary IS NOT NULL AND ${caseSensitive ? 'summary LIKE ?' : 'LOWER(summary) LIKE ?'})
             )
             ORDER BY 
                 CASE WHEN ${caseSensitive ? 'name' : 'LOWER(name)'} LIKE ? THEN 1 ELSE 2 END,
                 name
             LIMIT ?`,
            caseSensitive
                ? [pluginId, searchPattern, searchPattern, searchPattern, exactPattern, limit]
                : [pluginId, searchPattern, searchPattern, searchPattern, exactPattern, limit]
        );
        
        return rows.map((row: any) => ({
            dimension: 'Y' as const,
            id: row.symbol_id,
            label: `${row.name} (${row.kind})`,
            description: `Symbol in ${row.path}`,
            filePath: row.path,
            metadata: {
                kind: row.kind,
                symbolId: row.symbol_id
            }
        }));
    }

    /**
     * Searches in W-Dimension (ADRs).
     */
    private async searchAdrs(query: string, pluginId: string, limit: number, caseSensitive: boolean): Promise<SearchResult[]> {
        const db = await this.dbManager.getDatabase('W');
        
        const searchPattern = caseSensitive ? `%${query}%` : `%${query.toLowerCase()}%`;
        const exactPattern = caseSensitive ? `%${query}%` : `%${query.toLowerCase()}%`;
        
        const rows = await this.queryDatabase<any>(
            db,
            `SELECT * FROM adrs 
             WHERE plugin_id = ? 
             AND deleted_at IS NULL
             AND (
                 ${caseSensitive ? 'title LIKE ?' : 'LOWER(title) LIKE ?'}
                 OR ${caseSensitive ? 'adr_number LIKE ?' : 'LOWER(adr_number) LIKE ?'}
                 OR ${caseSensitive ? 'content_markdown LIKE ?' : 'LOWER(content_markdown) LIKE ?'}
             )
             ORDER BY 
                 CASE WHEN ${caseSensitive ? 'title' : 'LOWER(title)'} LIKE ? THEN 1 ELSE 2 END,
                 adr_number
             LIMIT ?`,
            caseSensitive
                ? [pluginId, searchPattern, searchPattern, searchPattern, exactPattern, limit]
                : [pluginId, searchPattern, searchPattern, searchPattern, exactPattern, limit]
        );
        
        return rows.map((row: any) => ({
            dimension: 'W' as const,
            id: row.adr_number,
            label: `ADR-${row.adr_number}: ${row.title}`,
            description: `Architecture Decision Record`,
            metadata: {
                fileName: row.file_name,
                adrNumber: row.adr_number
            }
        }));
    }

    /**
     * Searches in Z-Dimension (Dependencies).
     */
    private async searchDependencies(query: string, pluginId: string, limit: number, caseSensitive: boolean): Promise<SearchResult[]> {
        const db = await this.dbManager.getDatabase('Z');
        
        const searchPattern = caseSensitive ? `%${query}%` : `%${query.toLowerCase()}%`;
        const exactPattern = caseSensitive ? `%${query}%` : `%${query.toLowerCase()}%`;
        
        const rows = await this.queryDatabase<any>(
            db,
            `SELECT * FROM dependencies 
             WHERE plugin_id = ? 
             AND (
                 ${caseSensitive ? 'from_module LIKE ?' : 'LOWER(from_module) LIKE ?'}
                 OR ${caseSensitive ? 'to_module LIKE ?' : 'LOWER(to_module) LIKE ?'}
             )
             ORDER BY 
                 CASE WHEN ${caseSensitive ? 'from_module' : 'LOWER(from_module)'} LIKE ? THEN 1 ELSE 2 END,
                 from_module, to_module
             LIMIT ?`,
            caseSensitive
                ? [pluginId, searchPattern, searchPattern, exactPattern, limit]
                : [pluginId, searchPattern, searchPattern, exactPattern, limit]
        );
        
        return rows.map((row: any) => ({
            dimension: 'Z' as const,
            id: row.id,
            label: `${row.from_module} → ${row.to_module}`,
            description: `Dependency: ${row.dependency_type}`,
            metadata: {
                dependencyType: row.dependency_type,
                fromModule: row.from_module,
                toModule: row.to_module
            }
        }));
    }

    /**
     * Searches in T-Dimension (Changes).
     */
    private async searchChanges(query: string, pluginId: string, limit: number, caseSensitive: boolean): Promise<SearchResult[]> {
        const db = await this.dbManager.getDatabase('T');
        
        // Changes are searched by date or run type
        const searchPattern = caseSensitive ? `%${query}%` : `%${query.toLowerCase()}%`;
        
        const rows = await this.queryDatabase<any>(
            db,
            `SELECT * FROM change_reports 
             WHERE plugin_id = ? 
             AND (
                 ${caseSensitive ? 'run_type LIKE ?' : 'LOWER(run_type) LIKE ?'}
                 OR CAST(created_at AS TEXT) LIKE ?
             )
             ORDER BY created_at DESC
             LIMIT ?`,
            [pluginId, searchPattern, searchPattern, limit]
        );
        
        return rows.map((row: any) => ({
            dimension: 'T' as const,
            id: row.id,
            label: `${row.run_type} - ${new Date(row.created_at).toLocaleDateString()}`,
            description: `${row.parsed_files} files, ${row.total_dependencies} deps`,
            metadata: {
                runType: row.run_type,
                parsedFiles: row.parsed_files.toString(),
                totalDependencies: row.total_dependencies.toString()
            }
        }));
    }

    /**
     * Helper method to query database directly.
     */
    private async queryDatabase<T>(db: any, sql: string, params: any[]): Promise<T[]> {
        return new Promise((resolve, reject) => {
            db.all(sql, params, (err: Error | null, rows: T[] | undefined) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows || []);
                }
            });
        });
    }

    /**
     * Sorts results by relevance (exact matches first, then by dimension order).
     */
    private sortByRelevance(results: SearchResult[], query: string): SearchResult[] {
        const queryLower = query.toLowerCase();
        
        return results.sort((a, b) => {
            // Exact match in label gets highest priority
            const aExact = a.label.toLowerCase().includes(queryLower);
            const bExact = b.label.toLowerCase().includes(queryLower);
            
            if (aExact && !bExact) return -1;
            if (!aExact && bExact) return 1;
            
            // Then sort by dimension order: X, Y, Z, W, T
            const dimensionOrder: Record<string, number> = { X: 1, Y: 2, Z: 3, W: 4, T: 5 };
            const aOrder = dimensionOrder[a.dimension] || 99;
            const bOrder = dimensionOrder[b.dimension] || 99;
            
            if (aOrder !== bOrder) return aOrder - bOrder;
            
            // Finally sort alphabetically by label
            return a.label.localeCompare(b.label);
        });
    }
}

