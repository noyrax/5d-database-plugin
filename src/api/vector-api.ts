import { MultiDbManager } from '../core/multi-db-manager';
import { EmbeddingRepository } from '../repositories/embedding-repository';
import { ImportanceRepository } from '../repositories/importance-repository';
import { NavigationRepository } from '../repositories/navigation-repository';

/**
 * API for V-Dimension: Vectors
 * Provides access to embeddings, importance scores, and navigation metadata.
 */
export class VectorApi {
    private dbManager: MultiDbManager;

    constructor(dbManager: MultiDbManager) {
        this.dbManager = dbManager;
    }

    /**
     * Gets embedding for an entity.
     */
    async getEmbedding(
        dimension: 'X' | 'Y' | 'Z' | 'W' | 'T',
        entityId: string,
        pluginId: string,
        model: string
    ) {
        const db = await this.dbManager.getDatabase('V');
        const embeddingRepo = new EmbeddingRepository(db);
        return embeddingRepo.getByEntity(dimension, entityId, pluginId, model);
    }

    /**
     * Gets importance score for an entity.
     */
    async getImportanceScore(
        dimension: 'X' | 'Y' | 'Z' | 'W' | 'T',
        entityId: string,
        pluginId: string
    ) {
        const db = await this.dbManager.getDatabase('V');
        const importanceRepo = new ImportanceRepository(db);
        return importanceRepo.getByEntity(dimension, entityId, pluginId);
    }

    /**
     * Gets navigation metadata for an entity.
     */
    async getNavigationMetadata(
        dimension: 'X' | 'Y' | 'Z' | 'W' | 'T',
        entityId: string,
        pluginId: string
    ) {
        const db = await this.dbManager.getDatabase('V');
        const navRepo = new NavigationRepository(db);
        return navRepo.getByEntity(dimension, entityId, pluginId);
    }

    /**
     * Gets all entry points for a dimension.
     */
    async getEntryPoints(
        dimension: 'X' | 'Y' | 'Z' | 'W' | 'T',
        pluginId: string
    ) {
        const db = await this.dbManager.getDatabase('V');
        const navRepo = new NavigationRepository(db);
        return navRepo.getEntryPoints(dimension, pluginId);
    }
}


