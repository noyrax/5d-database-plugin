import { DependencyApi } from '../../api/dependency-api';
import { MultiDbManager } from '../../core/multi-db-manager';

/**
 * MCP Resource handler for dependencies (Z-Dimension)
 */
export class DependenciesResource {
    private dependencyApi: DependencyApi;

    constructor(dbManager: MultiDbManager) {
        this.dependencyApi = new DependencyApi(dbManager);
    }

    /**
     * Handles resource URI: db://dependencies/{id}
     */
    public async handleResource(uri: string): Promise<string> {
        const match = uri.match(/^db:\/\/dependencies\/(.+)$/);
        if (!match) {
            throw new Error(`Invalid dependency resource URI: ${uri}`);
        }

        const pluginId = match[1];
        const dependencies = await this.dependencyApi.getAllDependencies(pluginId);
        return JSON.stringify(dependencies, null, 2);
    }
}

