import { MultiDbManager } from '../core/multi-db-manager';
import { DependencyRepository } from '../repositories/dependency-repository';
import { Dependency } from '../models/dependency';

/**
 * API for Z-Dimension: Dependencies
 */
export class DependencyApi {
    private dbManager: MultiDbManager;

    constructor(dbManager: MultiDbManager) {
        this.dbManager = dbManager;
    }

    /**
     * Gets all dependencies for a plugin.
     */
    public async getAllDependencies(pluginId: string): Promise<Dependency[]> {
        const db = await this.dbManager.getDatabase('Z');
        const repository = new DependencyRepository(db);
        return repository.getAll(pluginId);
    }

    /**
     * Gets dependencies by from_module.
     */
    public async getDependenciesByFromModule(fromModule: string, pluginId: string): Promise<Dependency[]> {
        const db = await this.dbManager.getDatabase('Z');
        const repository = new DependencyRepository(db);
        return repository.findByFromModule(fromModule, pluginId);
    }

    /**
     * Gets dependencies by to_module.
     */
    public async getDependenciesByToModule(toModule: string, pluginId: string): Promise<Dependency[]> {
        const db = await this.dbManager.getDatabase('Z');
        const repository = new DependencyRepository(db);
        return repository.findByToModule(toModule, pluginId);
    }

    /**
     * Gets a dependency by ID.
     */
    public async getDependencyById(id: string, pluginId: string): Promise<Dependency | null> {
        const db = await this.dbManager.getDatabase('Z');
        const repository = new DependencyRepository(db);
        return repository.getById(id, pluginId);
    }
}

