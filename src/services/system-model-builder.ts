import { MultiDbManager } from '../core/multi-db-manager';
import { ModuleRepository } from '../repositories/module-repository';
import { SymbolRepository } from '../repositories/symbol-repository';
import { DependencyRepository } from '../repositories/dependency-repository';
import { AdrRepository } from '../repositories/adr-repository';
import { Module } from '../models/module';
import { Dependency } from '../models/dependency';
import { Adr } from '../models/adr';

/**
 * Builds system-level aggregates from multiple dimensions.
 * Combines data from X, Y, Z, and W dimensions to create comprehensive system views.
 */
export class SystemModelBuilder {
    private dbManager: MultiDbManager;

    constructor(dbManager: MultiDbManager) {
        this.dbManager = dbManager;
    }

    /**
     * Builds a module dependency graph combining X and Z dimensions.
     * 
     * @param pluginId The plugin ID
     * @returns Map of module path to its dependencies
     */
    public async buildModuleDependencyGraph(pluginId: string): Promise<Map<string, string[]>> {
        const moduleDb = await this.dbManager.getDatabase('X');
        const depDb = await this.dbManager.getDatabase('Z');
        
        const moduleRepo = new ModuleRepository(moduleDb);
        const depRepo = new DependencyRepository(depDb);
        
        const modules = await moduleRepo.getAll(pluginId);
        const dependencies = await depRepo.getAll(pluginId);
        
        const graph = new Map<string, string[]>();
        
        for (const module of modules) {
            graph.set(module.file_path, []);
        }
        
        for (const dep of dependencies) {
            const deps = graph.get(dep.from_module) || [];
            deps.push(dep.to_module);
            graph.set(dep.from_module, deps);
        }
        
        return graph;
    }

    /**
     * Builds a symbol dependency tree combining Y and Z dimensions.
     * 
     * @param filePath Repository-relative source path
     * @param pluginId The plugin ID
     * @returns Map of symbol name to its dependencies
     */
    public async buildSymbolDependencyTree(
        filePath: string,
        pluginId: string
    ): Promise<Map<string, string[]>> {
        const symbolDb = await this.dbManager.getDatabase('Y');
        const symbolRepo = new SymbolRepository(symbolDb);
        
        const symbols = await symbolRepo.findByPath(filePath, pluginId);
        const tree = new Map<string, string[]>();
        
        for (const symbol of symbols) {
            const deps = await symbolRepo.getSymbolDependencies(symbol.id);
            const depModules = deps.map(d => d.dependency_module);
            tree.set(symbol.name, depModules);
        }
        
        return tree;
    }

    /**
     * Builds an architectural view combining X, W, and Z dimensions.
     * Shows modules with their ADRs and dependencies.
     * 
     * @param pluginId The plugin ID
     * @returns Array of module views with ADRs and dependencies
     */
    public async buildArchitecturalView(pluginId: string): Promise<Array<{
        module: Module;
        adrs: Adr[];
        dependencies: Dependency[];
    }>> {
        const moduleDb = await this.dbManager.getDatabase('X');
        const adrDb = await this.dbManager.getDatabase('W');
        const depDb = await this.dbManager.getDatabase('Z');
        
        const moduleRepo = new ModuleRepository(moduleDb);
        const adrRepo = new AdrRepository(adrDb);
        const depRepo = new DependencyRepository(depDb);
        
        const modules = await moduleRepo.getAll(pluginId);
        const views: Array<{
            module: Module;
            adrs: Adr[];
            dependencies: Dependency[];
        }> = [];
        
        for (const module of modules) {
            const adrs = await adrRepo.findByFilePath(module.file_path, pluginId);
            const dependencies = await depRepo.findByFromModule(module.file_path, pluginId);
            
            views.push({
                module,
                adrs,
                dependencies
            });
        }
        
        return views;
    }
}

