import { MultiDbManager } from '../core/multi-db-manager';
import { IdMapper } from '../core/id-mapper';
import { CrossDimensionApi } from '../api/cross-dimension-api';
import { ModuleApi } from '../api/module-api';
import { SymbolApi } from '../api/symbol-api';
import { DependencyApi } from '../api/dependency-api';
import { AdrApi } from '../api/adr-api';
import { ChangeApi } from '../api/change-api';
import { SemanticPatternMatcher, ArchitecturalPattern } from './semantic-pattern-matcher';
import { Module } from '../models/module';
import { Symbol } from '../models/symbol';
import { Dependency } from '../models/dependency';
import { Adr } from '../models/adr';

/**
 * Complete module context for ADR reconstruction.
 */
export interface ModuleContext {
    module: Module;
    symbols: Symbol[];
    dependencies: Dependency[];  // Outgoing dependencies
    incomingDependencies: Dependency[];  // Who uses this module?
    changes: any[];  // Change records
    relatedAdrs: Adr[];  // ADRs that reference this module
    similarModules: Array<{ module: Module; score: number }>;
    patterns: ArchitecturalPattern[];
}

/**
 * Builds complete module context from all 5 dimensions (X, Y, Z, W, T).
 * Used for deterministic ADR reconstruction.
 */
export class AdrContextBuilder {
    private crossDimensionApi: CrossDimensionApi;
    private moduleApi: ModuleApi;
    private symbolApi: SymbolApi;
    private dependencyApi: DependencyApi;
    private adrApi: AdrApi;
    private changeApi: ChangeApi;
    private patternMatcher: SemanticPatternMatcher;

    constructor(
        dbManager: MultiDbManager,
        idMapper: IdMapper,
        patternMatcher: SemanticPatternMatcher
    ) {
        this.crossDimensionApi = new CrossDimensionApi(dbManager, idMapper);
        this.moduleApi = new ModuleApi(dbManager);
        this.symbolApi = new SymbolApi(dbManager);
        this.dependencyApi = new DependencyApi(dbManager);
        this.adrApi = new AdrApi(dbManager);
        this.changeApi = new ChangeApi(dbManager);
        this.patternMatcher = patternMatcher;
    }

    /**
     * Builds complete module context from all 5 dimensions.
     */
    public async buildModuleContext(
        module: Module,
        pluginId: string
    ): Promise<ModuleContext> {
        // Gather data from all dimensions in parallel
        const [
            symbols,
            dependencies,
            incomingDependencies,
            changes,
            relatedAdrs,
            similarModules,
            patterns
        ] = await Promise.all([
            this.gatherSymbols(module, pluginId),
            this.gatherDependencies(module, pluginId),
            this.gatherIncomingDependencies(module, pluginId),
            this.gatherChanges(module, pluginId),
            this.gatherRelatedAdrs(module, pluginId),
            this.gatherSimilarModules(module, pluginId),
            this.gatherPatterns(module, pluginId)
        ]);

        return {
            module,
            symbols,
            dependencies,
            incomingDependencies,
            changes,
            relatedAdrs,
            similarModules,
            patterns
        };
    }

    /**
     * Gathers symbols (Y-Dimension) for the module.
     */
    private async gatherSymbols(module: Module, pluginId: string): Promise<Symbol[]> {
        try {
            return await this.symbolApi.getSymbolsByPath(module.file_path, pluginId);
        } catch (error) {
            console.warn(`[AdrContextBuilder] Failed to gather symbols for ${module.file_path}: ${error}`);
            return [];
        }
    }

    /**
     * Gathers outgoing dependencies (Z-Dimension) for the module.
     */
    private async gatherDependencies(module: Module, pluginId: string): Promise<Dependency[]> {
        try {
            return await this.dependencyApi.getDependenciesByFromModule(module.file_path, pluginId);
        } catch (error) {
            console.warn(`[AdrContextBuilder] Failed to gather dependencies for ${module.file_path}: ${error}`);
            return [];
        }
    }

    /**
     * Gathers incoming dependencies (Z-Dimension) - who uses this module?
     */
    private async gatherIncomingDependencies(module: Module, pluginId: string): Promise<Dependency[]> {
        try {
            return await this.dependencyApi.getDependenciesByToModule(module.file_path, pluginId);
        } catch (error) {
            console.warn(`[AdrContextBuilder] Failed to gather incoming dependencies for ${module.file_path}: ${error}`);
            return [];
        }
    }

    /**
     * Gathers changes (T-Dimension) for the module.
     */
    private async gatherChanges(module: Module, pluginId: string): Promise<any[]> {
        try {
            // ChangeApi might not have a method for module-specific changes
            // For now, return empty array - can be extended later
            return [];
        } catch (error) {
            console.warn(`[AdrContextBuilder] Failed to gather changes for ${module.file_path}: ${error}`);
            return [];
        }
    }

    /**
     * Gathers related ADRs (W-Dimension) that reference this module.
     */
    private async gatherRelatedAdrs(module: Module, pluginId: string): Promise<Adr[]> {
        try {
            return await this.adrApi.getAdrsByFilePath(module.file_path, pluginId);
        } catch (error) {
            console.warn(`[AdrContextBuilder] Failed to gather related ADRs for ${module.file_path}: ${error}`);
            return [];
        }
    }

    /**
     * Gathers similar modules using Semantic Pattern Matcher.
     */
    private async gatherSimilarModules(
        module: Module,
        pluginId: string
    ): Promise<Array<{ module: Module; score: number }>> {
        try {
            const similarModules = await this.patternMatcher.findSimilarModules(module, pluginId, 5);
            return similarModules.map(sm => ({
                module: sm.module,
                score: sm.similarityScore
            }));
        } catch (error) {
            console.warn(`[AdrContextBuilder] Failed to gather similar modules for ${module.file_path}: ${error}`);
            return [];
        }
    }

    /**
     * Gathers architectural patterns using Semantic Pattern Matcher.
     */
    private async gatherPatterns(
        module: Module,
        pluginId: string
    ): Promise<ArchitecturalPattern[]> {
        try {
            return await this.patternMatcher.findPatterns(module, pluginId);
        } catch (error) {
            console.warn(`[AdrContextBuilder] Failed to gather patterns for ${module.file_path}: ${error}`);
            return [];
        }
    }
}

