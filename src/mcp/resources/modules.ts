import { ModuleApi } from '../../api/module-api';
import { MultiDbManager } from '../../core/multi-db-manager';

/**
 * MCP Resource handler for modules (X-Dimension)
 */
export class ModulesResource {
    private moduleApi: ModuleApi;

    constructor(dbManager: MultiDbManager) {
        this.moduleApi = new ModuleApi(dbManager);
    }

    /**
     * Handles resource URI: db://modules/{id}
     */
    public async handleResource(uri: string): Promise<string> {
        const match = uri.match(/^db:\/\/modules\/(.+)$/);
        if (!match) {
            throw new Error(`Invalid module resource URI: ${uri}`);
        }

        const pluginId = match[1];
        const modules = await this.moduleApi.getAllModules(pluginId);
        return JSON.stringify(modules, null, 2);
    }
}

