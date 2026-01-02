import { ModuleApi } from '../../api/module-api';
import { MultiDbManager } from '../../core/multi-db-manager';

/**
 * MCP Tool: query_modules
 * Queries modules by file path
 */
export class QueryModulesTool {
    private moduleApi: ModuleApi;

    constructor(dbManager: MultiDbManager) {
        this.moduleApi = new ModuleApi(dbManager);
    }

    /**
     * Executes the query_modules tool.
     */
    public async execute(args: { filePath: string; pluginId: string }): Promise<string> {
        const module = await this.moduleApi.getModuleByPath(args.filePath, args.pluginId);
        return JSON.stringify(module, null, 2);
    }
}

