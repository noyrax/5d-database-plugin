import { DependencyApi } from '../../api/dependency-api';
import { MultiDbManager } from '../../core/multi-db-manager';

/**
 * MCP Tool: query_dependencies
 * Queries dependencies by module
 */
export class QueryDependenciesTool {
    private dependencyApi: DependencyApi;

    constructor(dbManager: MultiDbManager) {
        this.dependencyApi = new DependencyApi(dbManager);
    }

    /**
     * Executes the query_dependencies tool.
     */
    public async execute(args: { fromModule?: string; toModule?: string; pluginId: string }): Promise<string> {
        let dependencies;
        if (args.fromModule) {
            dependencies = await this.dependencyApi.getDependenciesByFromModule(args.fromModule, args.pluginId);
        } else if (args.toModule) {
            dependencies = await this.dependencyApi.getDependenciesByToModule(args.toModule, args.pluginId);
        } else {
            dependencies = await this.dependencyApi.getAllDependencies(args.pluginId);
        }
        return JSON.stringify(dependencies, null, 2);
    }
}

