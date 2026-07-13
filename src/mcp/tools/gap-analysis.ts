import { MultiDbManager } from '../../core/multi-db-manager';
import { CrossDimensionApi } from '../../api/cross-dimension-api';
import { DependencyApi } from '../../api/dependency-api';
import { AdrApi } from '../../api/adr-api';
import { ModuleApi } from '../../api/module-api';
import { IdMapper } from '../../core/id-mapper';
import { AdrGeneratorTool } from './adr-generator';
import { SemanticSearchApi } from '../../api/semantic-search-api';
import * as path from 'path';

/**
 * MCP Tool: gap_analysis
 * Finds documentation gaps by analyzing modules with many dependencies but few/no ADRs.
 */
export class GapAnalysisTool {
    private crossDimensionApi: CrossDimensionApi;
    private dependencyApi: DependencyApi;
    private adrApi: AdrApi;
    private moduleApi: ModuleApi;
    private dbManager: MultiDbManager;
    private idMapper: IdMapper;
    private workspaceRoot: string;

    constructor(dbManager: MultiDbManager, idMapper: IdMapper, workspaceRoot?: string) {
        this.crossDimensionApi = new CrossDimensionApi(dbManager, idMapper);
        this.dependencyApi = new DependencyApi(dbManager);
        this.adrApi = new AdrApi(dbManager);
        this.moduleApi = new ModuleApi(dbManager);
        this.dbManager = dbManager;
        this.idMapper = idMapper;
        this.workspaceRoot = workspaceRoot || process.cwd();
    }

    /**
     * Executes the gap_analysis tool.
     * 
     * @param args Arguments: minDependencies (default: 5), pluginId, limit (default: 50), autoGenerateAdrs (default: false)
     * @returns JSON string with gap analysis results including context information for ADR generation by KI-Agent
     * 
     * Note: autoGenerateAdrs is false by default. When false, the tool provides context information
     * (similar modules with ADRs, dependency details, cross-dimension context) to help the KI-Agent
     * create ADRs according to the schema defined in .cursor/rules/022-adr-workflow.mdc
     */
    public async execute(args: { 
        minDependencies?: number; 
        pluginId: string;
        limit?: number;
        autoGenerateAdrs?: boolean;
    }): Promise<string> {
        const minDeps = args.minDependencies || 5;
        const limit = args.limit || 50;

        // Build architectural view (combines X, W, Z dimensions)
        let architecturalView;
        try {
            architecturalView = await this.crossDimensionApi.buildArchitecturalView(args.pluginId);
        } catch (error: any) {
            console.error(`[GapAnalysisTool] Failed to build architectural view: ${error?.message || String(error)}`);
            // Return empty result with error info
            return JSON.stringify({
                summary: {
                    min_dependencies_threshold: minDeps,
                    analysis_date: new Date().toISOString(),
                    statistics: {
                        total_modules_analyzed: 0,
                        modules_with_many_deps: 0,
                        modules_without_adrs: 0,
                        modules_with_few_adrs: 0,
                        well_documented_modules: 0,
                        avg_dependencies: 0,
                        avg_adrs: 0
                    },
                    auto_generated_adrs: 0,
                    error: `Failed to build architectural view: ${error?.message || String(error)}`
                },
                gaps: {
                    without_adrs: [],
                    with_few_adrs: [],
                    well_documented: []
                },
                generated_adrs: [],
                recommendations: [
                    `❌ Gap-Analyse fehlgeschlagen: ${error?.message || String(error)}`,
                    'Prüfe ob Datenbanken existieren und Ingestion ausgeführt wurde.',
                    'Führe `workflow/generate_and_ingest` aus, um Datenbanken zu aktualisieren.'
                ]
            }, null, 2);
        }

        // Fallback: If architectural view is empty, try direct database queries
        if (architecturalView.length === 0) {
            return await this.fallbackDirectQuery(args.pluginId, minDeps, limit);
        }

        // Analyze gaps
        const gaps = await Promise.all(
            architecturalView
                .filter(view => view.dependencies.length >= minDeps)
                .map(async view => {
                    // WICHTIG: buildArchitecturalView gibt nur Module aus X-Dimension zurück
                    // X-Dimension = docs/modules/ = alle Module haben bereits API-Docs
                    const hasApiDocs = true; // buildArchitecturalView gibt nur Module aus X-Dimension zurück
                    
                    const baseGap = {
                        module: {
                            file_path: view.module.file_path,
                            content_hash: view.module.content_hash
                        },
                        dependency_count: view.dependencies.length,
                        adr_count: view.adrs.length,
                        adr_numbers: view.adrs.map(adr => adr.adr_number),
                        has_api_docs: hasApiDocs, // Immer true für Module in buildArchitecturalView
                        gap_score: this.calculateGapScore(view.dependencies.length, view.adrs.length, hasApiDocs),
                        has_adrs: view.adrs.length > 0,
                        // Modul ist dokumentiert wenn es API-Docs ODER ADRs hat
                        // Da alle Module API-Docs haben, sind alle dokumentiert
                        // ADRs sind nur für architektonische Entscheidungen nötig
                        is_documented: hasApiDocs || view.adrs.length > 0
                    };

                    // Add context information for modules without ADRs (for KI-Agent ADR generation)
                    if (!baseGap.has_adrs) {
                        // Try semantic fallback linking
                        const semanticMatches = await this.findSemanticAdrMatches(view.module, args.pluginId, 0.4);
                        
                        const context = await this.buildAdrGenerationContext(view.module, view.dependencies, args.pluginId);
                        
                        // Add semantic matches to context
                        if (semanticMatches.length > 0) {
                            context.semantic_adr_matches = semanticMatches.map(m => ({
                                adr_number: m.adrNumber,
                                score: m.score,
                                match_type: "semantic_fallback"
                            }));
                        }
                        
                        return {
                            ...baseGap,
                            context_for_adr_generation: context
                        };
                    }

                    return baseGap;
                })
        );

        // Sort by gap score (highest first) and limit
        gaps.sort((a, b) => b.gap_score - a.gap_score);
        const limitedGaps = gaps.slice(0, limit);

        // Separate into categories
        const withoutAdrs = limitedGaps.filter(g => !g.has_adrs);
        const withFewAdrs = limitedGaps.filter(g => g.has_adrs && g.adr_count < 2);
        const wellDocumented = limitedGaps.filter(g => g.has_adrs && g.adr_count >= 2);

        // Calculate statistics
        const stats = {
            total_modules_analyzed: architecturalView.length,
            modules_with_many_deps: limitedGaps.length,
            modules_without_adrs: withoutAdrs.length,
            modules_with_few_adrs: withFewAdrs.length,
            well_documented_modules: wellDocumented.length,
            avg_dependencies: limitedGaps.length > 0 
                ? Math.round(limitedGaps.reduce((sum, g) => sum + g.dependency_count, 0) / limitedGaps.length)
                : 0,
            avg_adrs: limitedGaps.length > 0 && limitedGaps.filter(g => g.has_adrs).length > 0
                ? Math.round(limitedGaps.filter(g => g.has_adrs).reduce((sum, g) => sum + g.adr_count, 0) / limitedGaps.filter(g => g.has_adrs).length)
                : 0
        };

        // Auto-generate ADRs if requested
        let generatedAdrs: any[] = [];
        if (args.autoGenerateAdrs && withoutAdrs.length > 0) {
            try {
                const adrGenerator = new AdrGeneratorTool(this.dbManager, this.idMapper, this.workspaceRoot);
                const generateResult = await adrGenerator.execute({
                    pluginId: args.pluginId,
                    minDependencies: minDeps,
                    limit: Math.min(withoutAdrs.length, limit),
                    dryRun: false
                });
                const parsed = JSON.parse(generateResult);
                generatedAdrs = parsed.generated_adrs || [];
            } catch (error) {
                console.warn(`[GapAnalysisTool] Failed to auto-generate ADRs: ${error}`);
            }
        }

        return JSON.stringify({
            summary: {
                min_dependencies_threshold: minDeps,
                analysis_date: new Date().toISOString(),
                statistics: stats,
                auto_generated_adrs: generatedAdrs.length
            },
            gaps: {
                without_adrs: withoutAdrs,
                with_few_adrs: withFewAdrs,
                well_documented: wellDocumented
            },
            generated_adrs: generatedAdrs,
            recommendations: this.generateRecommendations(withoutAdrs, withFewAdrs, generatedAdrs.length)
        }, null, 2);
    }

    /**
     * Builds context information for ADR generation by KI-Agent.
     * Includes similar modules with ADRs, existing patterns, and cross-dimension context.
     */
    private async buildAdrGenerationContext(
        module: any,
        dependencies: any[],
        pluginId: string
    ): Promise<{
        similar_modules_with_adrs: Array<{ file_path: string; adr_numbers: string[] }>;
        existing_adr_patterns: Array<{ adr_number: string; pattern: string }>;
        dependencies_details: Array<{ to_module: string; dependency_type?: string }>;
        cross_dimension_context: {
            symbols: Array<{ name: string; type: string }>;
            incoming_dependencies: number;
            outgoing_dependencies: number;
        };
        semantic_adr_matches?: Array<{ adr_number: string; score: number; match_type: string }>;
    }> {
        const context: any = {
            similar_modules_with_adrs: [],
            existing_adr_patterns: [],
            dependencies_details: [],
            cross_dimension_context: {
                symbols: [],
                incoming_dependencies: 0,
                outgoing_dependencies: dependencies.length
            }
        };

        try {
            // 1. Find similar modules with ADRs (same directory or similar path structure)
            const moduleDir = path.dirname(module.file_path);
            const allModules = await this.moduleApi.getAllModules(pluginId);
            
            // Get all ADRs and their file mappings
            const adrDb = await this.dbManager.getDatabase('W');
            const { AdrRepository } = await import('../../repositories/adr-repository');
            const adrRepo = new AdrRepository(adrDb);
            const allAdrs = await adrRepo.getAll(pluginId);

            // Build map of file_path -> ADR numbers using file mappings
            const adrsByPath = new Map<string, string[]>();
            for (const adr of allAdrs) {
                const fileMappings = await adrRepo.getAdrFileMappings(adr.id);
                for (const mapping of fileMappings) {
                    if (!adrsByPath.has(mapping.file_path)) {
                        adrsByPath.set(mapping.file_path, []);
                    }
                    adrsByPath.get(mapping.file_path)!.push(adr.adr_number);
                }
            }

            // Find modules in same directory or similar path structure with ADRs
            for (const otherModule of allModules) {
                if (otherModule.file_path === module.file_path) continue;
                
                const otherModuleDir = path.dirname(otherModule.file_path);
                const hasAdrs = adrsByPath.has(otherModule.file_path);
                
                // Similar if same directory or similar path depth
                if (hasAdrs && (otherModuleDir === moduleDir || 
                    otherModuleDir.split(path.sep).length === moduleDir.split(path.sep).length)) {
                    context.similar_modules_with_adrs.push({
                        file_path: otherModule.file_path,
                        adr_numbers: adrsByPath.get(otherModule.file_path) || []
                    });
                }
            }

            // Limit to top 5 similar modules
            context.similar_modules_with_adrs = context.similar_modules_with_adrs.slice(0, 5);

            // 2. Extract ADR patterns from similar modules
            for (const similar of context.similar_modules_with_adrs) {
                for (const adrNumber of similar.adr_numbers) {
                    const adr = await this.adrApi.getAdrByNumber(adrNumber, pluginId);
                    if (adr) {
                        // Extract pattern: first line of decision or context
                        const pattern = adr.content_markdown?.split('\n').find((line: string) => 
                            line.trim().startsWith('## Entscheidung') || 
                            line.trim().startsWith('## Kontext')
                        ) || 'ADR pattern';
                        context.existing_adr_patterns.push({
                            adr_number: adrNumber,
                            pattern: pattern.substring(0, 100) // Limit length
                        });
                    }
                }
            }

            // Limit to top 10 patterns
            context.existing_adr_patterns = context.existing_adr_patterns.slice(0, 10);

            // 3. Get detailed dependencies information
            context.dependencies_details = dependencies.map(dep => ({
                to_module: dep.to_module || dep.toModule || '',
                dependency_type: dep.dependency_type || dep.dependencyType || 'import'
            }));

            // 4. Get incoming dependencies count
            const incomingDeps = await this.dependencyApi.getDependenciesByToModule(module.file_path, pluginId);
            context.cross_dimension_context.incoming_dependencies = incomingDeps.length;

            // 5. Get symbols for cross-dimension context
            const symbols = await this.crossDimensionApi.getSymbolsForModule(module.file_path, pluginId);
            context.cross_dimension_context.symbols = symbols.slice(0, 20).map((sym: any) => ({
                name: sym.name || sym.symbol_name || '',
                type: sym.type || sym.symbol_type || ''
            }));

        } catch (error: any) {
            console.warn(`[GapAnalysisTool] Failed to build ADR generation context for ${module.file_path}: ${error?.message || String(error)}`);
        }

        return context;
    }

    /**
     * Finds semantic ADR matches for a module without explicit ADR links.
     * Uses semantic search to find relevant ADRs based on module path and description.
     * 
     * @param module Module to find ADRs for
     * @param pluginId Plugin ID
     * @param threshold Minimum similarity score (default: 0.4)
     * @returns Array of ADR matches with scores
     */
    private async findSemanticAdrMatches(
        module: any,
        pluginId: string,
        threshold: number = 0.4
    ): Promise<Array<{ adrNumber: string; score: number }>> {
        try {
            // SemanticSearchApi requires EmbeddingGenerator in constructor
            const { EmbeddingGenerator } = await import('../../embedding/embedding-generator');
            const embeddingGenerator = new EmbeddingGenerator();
            
            // Check if embedding generator is configured (requires OpenAI API key)
            if (!embeddingGenerator.isConfigured()) {
                // Semantic search not available, return empty array
                return [];
            }
            
            const semanticSearchApi = new SemanticSearchApi(this.dbManager, embeddingGenerator);
            
            // Build semantic query from module path and description
            // Example: "dashboard/src/api/server.ts server api"
            const moduleName = path.basename(module.file_path, path.extname(module.file_path));
            const moduleDir = path.dirname(module.file_path);
            // Build query from path components
            const query = `${module.file_path} ${moduleName} ${moduleDir.split(path.sep).pop() || ''}`;
            
            // Search ADRs semantically (W-Dimension only)
            const results = await semanticSearchApi.search(query, pluginId, {
                dimensions: ['W'],
                limit: 5,
                minScore: threshold
            });
            
            // Filter by threshold and extract ADR numbers
            const matches: Array<{ adrNumber: string; score: number }> = [];
            for (const result of results) {
                if (result.score >= threshold) {
                    // Extract ADR number from externalId (format: "ADR-072" or just "072")
                    const adrNumberMatch = result.externalId.match(/ADR-?(\d+)/i);
                    if (adrNumberMatch) {
                        matches.push({
                            adrNumber: adrNumberMatch[1],
                            score: result.score
                        });
                    }
                }
            }
            
            return matches;
        } catch (error: any) {
            console.warn(`[GapAnalysisTool] Failed to find semantic ADR matches for ${module.file_path}: ${error?.message || String(error)}`);
            return [];
        }
    }

    /**
     * Calculates a gap score for prioritization.
     * Higher score = more urgent to document.
     * 
     * Formula: (dependency_count * 2) - (adr_count * 10) - (hasApiDocs ? 50 : 0)
     * This prioritizes modules with many dependencies but few ADRs.
     * Module mit API-Docs sind bereits dokumentiert, daher großer Penalty (-50).
     * Da buildArchitecturalView nur Module aus X-Dimension zurückgibt, haben alle Module API-Docs.
     */
    private calculateGapScore(dependencyCount: number, adrCount: number, hasApiDocs: boolean = false): number {
        const baseScore = (dependencyCount * 2) - (adrCount * 10);
        // Module mit API-Docs sind dokumentiert, großer Penalty
        // Da alle Module in buildArchitecturalView API-Docs haben, wird dieser Penalty immer angewendet
        return hasApiDocs ? baseScore - 50 : baseScore;
    }

    /**
     * Generates recommendations based on gaps.
     */
    private generateRecommendations(
        withoutAdrs: Array<{ module: { file_path: string }; dependency_count: number; gap_score: number }>,
        withFewAdrs: Array<{ module: { file_path: string }; dependency_count: number; adr_count: number; gap_score: number }>,
        generatedCount: number = 0
    ): string[] {
        const recommendations: string[] = [];

        if (withoutAdrs.length > 0) {
            recommendations.push(
                `🚨 ${withoutAdrs.length} Module ohne ADRs identifiziert. Diese sollten priorisiert werden:`
            );
            withoutAdrs.slice(0, 5).forEach((gap, index) => {
                recommendations.push(
                    `   ${index + 1}. ${gap.module.file_path} (${gap.dependency_count} Dependencies, Gap-Score: ${gap.gap_score})`
                );
            });
        }

        if (withFewAdrs.length > 0) {
            recommendations.push(
                `⚠️  ${withFewAdrs.length} Module mit nur wenigen ADRs. Erwägen Sie zusätzliche Dokumentation:`
            );
            withFewAdrs.slice(0, 3).forEach((gap, index) => {
                recommendations.push(
                    `   ${index + 1}. ${gap.module.file_path} (${gap.dependency_count} Dependencies, ${gap.adr_count} ADR(s))`
                );
            });
        }

        if (generatedCount > 0) {
            recommendations.push(`\n✅ ${generatedCount} ADR(s) wurden automatisch generiert.`);
        } else if (withoutAdrs.length > 0) {
            recommendations.push(`\n💡 Nutze die Kontext-Informationen (context_for_adr_generation) für jedes Modul, um ADRs nach Schema zu erstellen (siehe .cursor/rules/022-adr-workflow.mdc).`);
        }

        if (recommendations.length === 0) {
            recommendations.push('✅ Alle Module mit vielen Dependencies sind gut dokumentiert!');
        }

        return recommendations;
    }

    /**
     * Fallback: Direct database queries when buildArchitecturalView returns empty.
     * This handles cases where pluginId might not match or data structure differs.
     */
    private async fallbackDirectQuery(
        pluginId: string,
        minDeps: number,
        limit: number
    ): Promise<string> {
        const moduleDb = await this.dbManager.getDatabase('X');
        const depDb = await this.dbManager.getDatabase('Z');
        const adrDb = await this.dbManager.getDatabase('W');
        
        const { ModuleRepository } = await import('../../repositories/module-repository');
        const { DependencyRepository } = await import('../../repositories/dependency-repository');
        const { AdrRepository } = await import('../../repositories/adr-repository');
        
        const moduleRepo = new ModuleRepository(moduleDb);
        const depRepo = new DependencyRepository(depDb);
        const adrRepo = new AdrRepository(adrDb);
        
        // Get all modules
        const modules = await moduleRepo.getAll(pluginId);
        
        // Get dependency counts per module
        const depCounts = new Map<string, number>();
        const allDeps = await depRepo.getAll(pluginId);
        for (const dep of allDeps) {
            const count = depCounts.get(dep.from_module) || 0;
            depCounts.set(dep.from_module, count + 1);
        }
        
        // Build gaps with context information
        const gaps: Array<{
            module: { file_path: string; content_hash?: string };
            dependency_count: number;
            adr_count: number;
            adr_numbers: string[];
            gap_score: number;
            has_adrs: boolean;
            context_for_adr_generation?: any;
        }> = [];
        
        for (const module of modules) {
            const depCount = depCounts.get(module.file_path) || 0;
            if (depCount >= minDeps) {
                const adrs = await adrRepo.findByFilePath(module.file_path, pluginId);
                const dependencies = await depRepo.findByFromModule(module.file_path, pluginId);
                
                // WICHTIG: Module aus X-Dimension haben bereits API-Docs
                // X-Dimension = docs/modules/ = alle Module haben bereits API-Docs
                const hasApiDocs = true; // Module aus X-Dimension haben immer API-Docs
                
                const baseGap = {
                    module: {
                        file_path: module.file_path,
                        content_hash: module.content_hash
                    },
                    dependency_count: depCount,
                    adr_count: adrs.length,
                    adr_numbers: adrs.map(adr => adr.adr_number),
                    has_api_docs: hasApiDocs, // Immer true für Module aus X-Dimension
                    gap_score: this.calculateGapScore(depCount, adrs.length, hasApiDocs),
                    has_adrs: adrs.length > 0,
                    // Modul ist dokumentiert wenn es API-Docs ODER ADRs hat
                    is_documented: hasApiDocs || adrs.length > 0
                };

                // Add context information for modules without ADRs
                if (!baseGap.has_adrs) {
                    // Try semantic fallback linking
                    const semanticMatches = await this.findSemanticAdrMatches(module, pluginId, 0.4);
                    
                    const context = await this.buildAdrGenerationContext(module, dependencies, pluginId);
                    
                    // Add semantic matches to context
                    if (semanticMatches.length > 0) {
                        context.semantic_adr_matches = semanticMatches.map(m => ({
                            adr_number: m.adrNumber,
                            score: m.score,
                            match_type: "semantic_fallback"
                        }));
                    }
                    
                    gaps.push({
                        ...baseGap,
                        context_for_adr_generation: context
                    });
                } else {
                    gaps.push(baseGap);
                }
            }
        }
        
        // Sort by gap score
        gaps.sort((a, b) => b.gap_score - a.gap_score);
        const limitedGaps = gaps.slice(0, limit);
        
        // Separate into categories
        const withoutAdrs = limitedGaps.filter(g => !g.has_adrs);
        const withFewAdrs = limitedGaps.filter(g => g.has_adrs && g.adr_count < 2);
        const wellDocumented = limitedGaps.filter(g => g.has_adrs && g.adr_count >= 2);
        
        // Calculate statistics
        const stats = {
            total_modules_analyzed: modules.length,
            modules_with_many_deps: limitedGaps.length,
            modules_without_adrs: withoutAdrs.length,
            modules_with_few_adrs: withFewAdrs.length,
            well_documented_modules: wellDocumented.length,
            avg_dependencies: limitedGaps.length > 0 
                ? Math.round(limitedGaps.reduce((sum, g) => sum + g.dependency_count, 0) / limitedGaps.length)
                : 0,
            avg_adrs: limitedGaps.length > 0 && limitedGaps.filter(g => g.has_adrs).length > 0
                ? Math.round(limitedGaps.filter(g => g.has_adrs).reduce((sum, g) => sum + g.adr_count, 0) / limitedGaps.filter(g => g.has_adrs).length)
                : 0
        };
        
        return JSON.stringify({
            summary: {
                min_dependencies_threshold: minDeps,
                analysis_date: new Date().toISOString(),
                statistics: stats,
                auto_generated_adrs: 0,
                fallback_used: true,
                note: 'Fallback direct database queries used (buildArchitecturalView returned empty)'
            },
            gaps: {
                without_adrs: withoutAdrs,
                with_few_adrs: withFewAdrs,
                well_documented: wellDocumented
            },
            generated_adrs: [],
            recommendations: this.generateRecommendations(withoutAdrs, withFewAdrs, 0)
        }, null, 2);
    }
}

