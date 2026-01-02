import * as path from 'path';
import { MultiDbManager } from '../core/multi-db-manager';
import { ModuleRepository } from '../repositories/module-repository';
import { Module } from '../models/module';

/**
 * API for X-Dimension: Modules
 */
export class ModuleApi {
    private dbManager: MultiDbManager;

    constructor(dbManager: MultiDbManager) {
        this.dbManager = dbManager;
    }

    /**
     * Gets a module by ID.
     */
    public async getModuleById(id: string, pluginId: string): Promise<Module | null> {
        const db = await this.dbManager.getDatabase('X');
        const repository = new ModuleRepository(db);
        return repository.getById(id, pluginId);
    }

    /**
     * Gets a module by file path with flexible path normalization.
     * Supports various path formats:
     * - Absolute paths (with workspace root)
     * - Relative paths
     * - Paths with different separators (/, \)
     * - Paths with plugin prefixes
     */
    public async getModuleByPath(filePath: string, pluginId: string): Promise<Module | null> {
        const db = await this.dbManager.getDatabase('X');
        const repository = new ModuleRepository(db);
        
        // Try exact match first
        let module = await repository.getByFilePath(filePath, pluginId);
        if (module) {
            return module;
        }

        // Generate normalized path variants
        const pathVariants = this.normalizeFilePath(filePath);
        
        // Try each variant
        for (const variant of pathVariants) {
            module = await repository.getByFilePath(variant, pluginId);
            if (module) {
                return module;
            }
        }

        // Fallback: Try LIKE search with normalized path
        const normalized = this.normalizeFilePath(filePath)[0]; // First variant (most normalized)
        module = await repository.findByFilePathLike(normalized, pluginId);
        
        return module;
    }

    /**
     * Normalizes a file path to generate possible variants for flexible matching.
     * Returns an array of path variants in order of preference.
     * 
     * Generates variants:
     * - With/without leading slashes
     * - With/without plugin prefixes
     * - Different separators (normalized to /)
     */
    private normalizeFilePath(filePath: string): string[] {
        const variants: string[] = [];
        
        // Normalize separators to forward slashes
        let normalized = filePath.replace(/\\/g, '/');
        variants.push(normalized);
        
        // Remove leading slashes
        const withoutLeadingSlash = normalized.replace(/^\/+/, '');
        if (withoutLeadingSlash !== normalized) {
            variants.push(withoutLeadingSlash);
        }
        
        const pluginPrefixes = ['5d-database-plugin/', 'documentation-system-plugin/', 'mcp-server/'];
        
        // Remove common plugin prefixes (e.g., "5d-database-plugin/")
        for (const prefix of pluginPrefixes) {
            if (normalized.startsWith(prefix)) {
                const withoutPrefix = normalized.substring(prefix.length);
                variants.push(withoutPrefix);
            }
            // Also try without leading slash
            if (withoutLeadingSlash.startsWith(prefix)) {
                const withoutPrefix = withoutLeadingSlash.substring(prefix.length);
                variants.push(withoutPrefix);
            }
        }
        
        // ADD variants WITH plugin prefixes (if path doesn't already have one)
        // This handles cases where modules are stored with plugin prefix but queried without
        const hasPluginPrefix = pluginPrefixes.some(prefix => 
            normalized.startsWith(prefix) || withoutLeadingSlash.startsWith(prefix)
        );
        
        if (!hasPluginPrefix) {
            // Add variants with each plugin prefix
            for (const prefix of pluginPrefixes) {
                variants.push(`${prefix}${withoutLeadingSlash}`);
                variants.push(`${prefix}${normalized}`);
            }
        }
        
        // Remove duplicates and return
        return Array.from(new Set(variants));
    }

    /**
     * Gets all modules for a plugin.
     */
    public async getAllModules(pluginId: string): Promise<Module[]> {
        const db = await this.dbManager.getDatabase('X');
        const repository = new ModuleRepository(db);
        return repository.getAll(pluginId);
    }

    /**
     * Gets modules by content hash (for change detection).
     */
    public async getModulesByContentHash(contentHash: string, pluginId: string): Promise<Module[]> {
        const db = await this.dbManager.getDatabase('X');
        const repository = new ModuleRepository(db);
        return repository.findByContentHash(contentHash, pluginId);
    }
}

