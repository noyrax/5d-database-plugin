import * as path from 'path';
import { MultiDbManager } from '../core/multi-db-manager';
import { ModuleRepository } from '../repositories/module-repository';
import { Module } from '../models/module';
import { PathNormalizer } from '../core/path-normalizer';

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
        const pathVariants = PathNormalizer.generateLookupVariants(filePath);
        
        // Try each variant
        for (const variant of pathVariants) {
            module = await repository.getByFilePath(variant, pluginId);
            if (module) {
                return module;
            }
        }

        // Fallback: Try LIKE search with normalized path
        const variants = PathNormalizer.generateLookupVariants(filePath);
        const normalized = variants[0]; // First variant (most normalized)
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

