import { MultiDbManager } from '../core/multi-db-manager';
import { IdMapper } from '../core/id-mapper';
import { SemanticSearchApi } from '../api/semantic-search-api';
import { ArchitectureMiningTool } from '../mcp/tools/architecture-mining';
import { EmbeddingGenerator } from '../embedding/embedding-generator';
import { ModuleApi } from '../api/module-api';
import { AdrApi } from '../api/adr-api';
import { Module } from '../models/module';
import { Adr } from '../models/adr';

/**
 * Similar module with similarity score
 */
export interface SimilarModule {
    module: Module;
    similarityScore: number;
}

/**
 * ADR for similar module
 */
export interface AdrForSimilarModule {
    adr: Adr;
    module: Module;
    similarityScore: number;
}

/**
 * Architectural pattern detected in code
 */
export interface ArchitecturalPattern {
    pattern: string;
    evidence: string[];
    confidence: 'high' | 'medium' | 'low';
}

/**
 * Uses Semantic Search (V-Dimension) and Architecture Mining to find similar modules and their ADRs.
 * Used for deterministic ADR reconstruction.
 */
export class SemanticPatternMatcher {
    private semanticSearchApi: SemanticSearchApi;
    private architectureMiningTool: ArchitectureMiningTool;
    private moduleApi: ModuleApi;
    private adrApi: AdrApi;
    private dbManager: MultiDbManager;

    constructor(
        dbManager: MultiDbManager,
        idMapper: IdMapper,
        embeddingGenerator: EmbeddingGenerator
    ) {
        this.dbManager = dbManager;
        this.semanticSearchApi = new SemanticSearchApi(dbManager, embeddingGenerator);
        this.architectureMiningTool = new ArchitectureMiningTool(dbManager, idMapper);
        this.moduleApi = new ModuleApi(dbManager);
        this.adrApi = new AdrApi(dbManager);
    }

    /**
     * Finds similar modules using Semantic Search (V-Dimension).
     */
    public async findSimilarModules(
        targetModule: Module,
        pluginId: string,
        limit: number = 5
    ): Promise<SimilarModule[]> {
        // Check if semantic search is available
        if (!this.semanticSearchApi['embeddingGenerator'].isConfigured()) {
            // Fallback: Use file path similarity
            return this.findSimilarModulesByPath(targetModule, pluginId, limit);
        }

        // Build query from module content
        const query = this.buildModuleQuery(targetModule);
        
        try {
            // Search for similar modules in X-Dimension
            const results = await this.semanticSearchApi.search(query, pluginId, {
                dimensions: ['X'],
                limit: limit * 2  // Get more results to filter out the target module
            });

            // Filter out the target module
            const filteredResults = results.filter(result => result.externalId !== targetModule.file_path);

            // Fetch actual modules for the results
            const modules: SimilarModule[] = [];
            for (const result of results.slice(0, limit * 2)) {
                if (result.externalId === targetModule.file_path) {
                    continue;  // Skip target module
                }
                
                const module = await this.moduleApi.getModuleByPath(result.externalId, pluginId);
                if (module) {
                    modules.push({
                        module,
                        similarityScore: result.score
                    });
                }
                
                if (modules.length >= limit) {
                    break;
                }
            }

            return modules;
        } catch (error) {
            console.warn(`[SemanticPatternMatcher] Semantic search failed, using fallback: ${error}`);
            return this.findSimilarModulesByPath(targetModule, pluginId, limit);
        }
    }

    /**
     * Finds ADRs for similar modules.
     */
    public async findAdrsForSimilarModules(
        targetModule: Module,
        pluginId: string
    ): Promise<AdrForSimilarModule[]> {
        const similarModules = await this.findSimilarModules(targetModule, pluginId, 10);
        const adrsForSimilar: AdrForSimilarModule[] = [];

        for (const similar of similarModules) {
            // Get ADRs for this similar module
            const adrs = await this.adrApi.getAdrsByFilePath(similar.module.file_path, pluginId);
            
            for (const adr of adrs) {
                adrsForSimilar.push({
                    adr,
                    module: similar.module,
                    similarityScore: similar.similarityScore
                });
            }
        }

        // Sort by similarity score (highest first)
        adrsForSimilar.sort((a, b) => b.similarityScore - a.similarityScore);

        return adrsForSimilar;
    }

    /**
     * Finds architectural patterns in the target module.
     */
    public async findPatterns(
        targetModule: Module,
        pluginId: string
    ): Promise<ArchitecturalPattern[]> {
        try {
            const miningResult = await this.architectureMiningTool.execute({
                pluginId,
                filePath: targetModule.file_path
            });

            const parsed = JSON.parse(miningResult);
            const decisions = parsed.decisions || [];

            return decisions.map((d: any) => ({
                pattern: d.pattern,
                evidence: d.evidence || [],
                confidence: d.confidence || 'medium'
            }));
        } catch (error) {
            console.warn(`[SemanticPatternMatcher] Architecture mining failed: ${error}`);
            return [];
        }
    }

    /**
     * Builds a semantic search query from module information.
     */
    private buildModuleQuery(module: Module): string {
        const fileName = module.file_path.split('/').pop() || '';
        const dirName = module.file_path.split('/').slice(-2, -1)[0] || '';
        
        // Extract key terms from file path
        const terms: string[] = [];
        
        // Add directory name if meaningful
        if (dirName && dirName !== 'src') {
            terms.push(dirName);
        }
        
        // Add file name without extension
        const baseName = fileName.replace(/\.[^/.]+$/, '');
        terms.push(baseName);
        
        // Extract words from camelCase/PascalCase
        const words = baseName
            .replace(/([A-Z])/g, ' $1')
            .split(/[\s_-]+/)
            .filter(w => w.length > 2);
        terms.push(...words);
        
        // Build query
        return terms.join(' ');
    }

    /**
     * Fallback: Finds similar modules by file path similarity.
     */
    private async findSimilarModulesByPath(
        targetModule: Module,
        pluginId: string,
        limit: number
    ): Promise<SimilarModule[]> {
        const allModules = await this.moduleApi.getAllModules(pluginId);
        const targetPath = targetModule.file_path;
        const targetDir = targetPath.split('/').slice(0, -1).join('/');
        const targetFileName = targetPath.split('/').pop() || '';
        
        // Score modules by path similarity
        const scored: Array<{ module: Module; score: number }> = [];
        
        for (const module of allModules) {
            if (module.file_path === targetPath) {
                continue;  // Skip target module
            }
            
            let score = 0;
            const modulePath = module.file_path;
            const moduleDir = modulePath.split('/').slice(0, -1).join('/');
            const moduleFileName = modulePath.split('/').pop() || '';
            
            // Same directory = high score
            if (moduleDir === targetDir) {
                score += 50;
            }
            
            // Similar directory structure = medium score
            const targetDirParts = targetDir.split('/');
            const moduleDirParts = moduleDir.split('/');
            const commonDirParts = targetDirParts.filter(part => moduleDirParts.includes(part));
            score += commonDirParts.length * 10;
            
            // Similar file name = medium score
            if (moduleFileName.toLowerCase().includes(targetFileName.toLowerCase().substring(0, 5)) ||
                targetFileName.toLowerCase().includes(moduleFileName.toLowerCase().substring(0, 5))) {
                score += 20;
            }
            
            // Same file name pattern (e.g., both end with "-api.ts")
            if (targetFileName.match(/-[a-z]+\.ts$/) && moduleFileName.match(/-[a-z]+\.ts$/)) {
                const targetSuffix = targetFileName.match(/-([a-z]+)\.ts$/)?.[1];
                const moduleSuffix = moduleFileName.match(/-([a-z]+)\.ts$/)?.[1];
                if (targetSuffix === moduleSuffix) {
                    score += 30;
                }
            }
            
            if (score > 0) {
                scored.push({ module, score });
            }
        }
        
        // Sort by score and return top results
        scored.sort((a, b) => b.score - a.score);
        
        return scored.slice(0, limit).map(item => ({
            module: item.module,
            similarityScore: item.score / 100  // Normalize to 0-1 range
        }));
    }
}

