import { MultiDbManager } from '../core/multi-db-manager';
import { IdMapper } from '../core/id-mapper';
import { CrossDimensionLinker } from '../services/cross-dimension-linker';
import { SystemModelBuilder } from '../services/system-model-builder';
import { EntityReference } from '../models/entity-reference';

/**
 * API for cross-dimension queries.
 * Combines data from multiple dimensions.
 */
export class CrossDimensionApi {
    private dbManager: MultiDbManager;
    private idMapper: IdMapper;
    private linker: CrossDimensionLinker;
    private systemBuilder: SystemModelBuilder;

    constructor(dbManager: MultiDbManager, idMapper: IdMapper) {
        this.dbManager = dbManager;
        this.idMapper = idMapper;
        this.linker = new CrossDimensionLinker(dbManager, idMapper);
        this.systemBuilder = new SystemModelBuilder(dbManager);
    }

    /**
     * Resolves a symbol ID to its module reference.
     */
    public async resolveSymbolToModule(
        symbolId: string,
        pluginId: string
    ): Promise<EntityReference | null> {
        return this.linker.resolveSymbolToModule(symbolId, pluginId);
    }

    /**
     * Gets all ADRs that reference a specific file path.
     */
    public async getAdrsForFilePath(
        filePath: string,
        pluginId: string
    ): Promise<EntityReference[]> {
        return this.linker.getAdrsForFilePath(filePath, pluginId);
    }

    /**
     * Gets all symbols for a module.
     */
    public async getSymbolsForModule(
        filePath: string,
        pluginId: string
    ): Promise<EntityReference[]> {
        return this.linker.getSymbolsForModule(filePath, pluginId);
    }

    /**
     * Builds a module dependency graph.
     */
    public async buildModuleDependencyGraph(pluginId: string): Promise<Map<string, string[]>> {
        return this.systemBuilder.buildModuleDependencyGraph(pluginId);
    }

    /**
     * Builds a symbol dependency tree for a file.
     */
    public async buildSymbolDependencyTree(
        filePath: string,
        pluginId: string
    ): Promise<Map<string, string[]>> {
        return this.systemBuilder.buildSymbolDependencyTree(filePath, pluginId);
    }

    /**
     * Builds an architectural view combining modules, ADRs, and dependencies.
     */
    public async buildArchitecturalView(pluginId: string): Promise<Array<{
        module: any;
        adrs: any[];
        dependencies: any[];
    }>> {
        return this.systemBuilder.buildArchitecturalView(pluginId);
    }
}

