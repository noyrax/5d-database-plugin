import { MultiDbManager } from '../../core/multi-db-manager';
import { IdMapper } from '../../core/id-mapper';
import { CrossDimensionApi } from '../../api/cross-dimension-api';
import { ModuleApi } from '../../api/module-api';
import { SymbolApi } from '../../api/symbol-api';
import { DependencyApi } from '../../api/dependency-api';
import { AdrApi } from '../../api/adr-api';

/**
 * MCP Tool: architecture_mining
 * Mines architectural decisions from code structure and patterns.
 * Compares with existing ADRs to identify undocumented decisions.
 */
export class ArchitectureMiningTool {
    private crossDimensionApi: CrossDimensionApi;
    private moduleApi: ModuleApi;
    private symbolApi: SymbolApi;
    private dependencyApi: DependencyApi;
    private adrApi: AdrApi;

    constructor(dbManager: MultiDbManager, idMapper: IdMapper) {
        this.crossDimensionApi = new CrossDimensionApi(dbManager, idMapper);
        this.moduleApi = new ModuleApi(dbManager);
        this.symbolApi = new SymbolApi(dbManager);
        this.dependencyApi = new DependencyApi(dbManager);
        this.adrApi = new AdrApi(dbManager);
    }

    /**
     * Executes the architecture_mining tool.
     * 
     * @param args Arguments: pluginId, filePath (optional - specific file to analyze)
     * @returns JSON string with mined architectural decisions
     */
    public async execute(args: { 
        pluginId: string;
        filePath?: string;
    }): Promise<string> {
        const decisions: Array<{
            pattern: string;
            evidence: string[];
            confidence: 'high' | 'medium' | 'low';
            suggested_adr_title: string;
            existing_adrs: string[];
        }> = [];

        if (args.filePath) {
            // Analyze specific file
            const module = await this.moduleApi.getModuleByPath(args.filePath, args.pluginId);
            if (module) {
                const symbols = await this.symbolApi.getSymbolsByPath(args.filePath, args.pluginId);
                const dependencies = await this.dependencyApi.getDependenciesByFromModule(args.filePath, args.pluginId);
                const existingAdrs = await this.adrApi.getAdrsByFilePath(args.filePath, args.pluginId);
                
                decisions.push(...this.analyzeModule(module, symbols, dependencies, existingAdrs));
            }
        } else {
            // Analyze entire system
            const modules = await this.moduleApi.getAllModules(args.pluginId);
            const allAdrs = await this.adrApi.getAllAdrs(args.pluginId);
            
            // Pattern recognition across all modules
            decisions.push(...this.recognizeSystemPatterns(modules, allAdrs));
        }

        return JSON.stringify({
            analysis_date: new Date().toISOString(),
            file_path: args.filePath || 'entire_system',
            decisions: decisions.sort((a, b) => {
                const confidenceOrder = { high: 3, medium: 2, low: 1 };
                return confidenceOrder[b.confidence] - confidenceOrder[a.confidence];
            }),
            summary: {
                total_decisions: decisions.length,
                high_confidence: decisions.filter(d => d.confidence === 'high').length,
                medium_confidence: decisions.filter(d => d.confidence === 'medium').length,
                low_confidence: decisions.filter(d => d.confidence === 'low').length,
                undocumented: decisions.filter(d => d.existing_adrs.length === 0).length
            }
        }, null, 2);
    }

    /**
     * Analyzes a single module for architectural patterns.
     */
    private analyzeModule(
        module: any,
        symbols: any[],
        dependencies: any[],
        existingAdrs: any[]
    ): Array<{
        pattern: string;
        evidence: string[];
        confidence: 'high' | 'medium' | 'low';
        suggested_adr_title: string;
        existing_adrs: string[];
    }> {
        const decisions: Array<{
            pattern: string;
            evidence: string[];
            confidence: 'high' | 'medium' | 'low';
            suggested_adr_title: string;
            existing_adrs: string[];
        }> = [];

        const filePath = module.file_path;
        const fileName = filePath.split('/').pop() || '';
        const existingAdrNumbers = existingAdrs.map(adr => adr.adr_number);

        // Pattern: Repository Pattern
        if (fileName.includes('repository') || fileName.includes('Repository')) {
            decisions.push({
                pattern: 'Repository Pattern',
                evidence: [
                    `File name contains "repository": ${fileName}`,
                    `Module path: ${filePath}`,
                    `Symbols: ${symbols.length} symbols found`
                ],
                confidence: 'high',
                suggested_adr_title: `Repository Pattern Implementation: ${filePath}`,
                existing_adrs: existingAdrNumbers
            });
        }

        // Pattern: API Layer
        if (filePath.includes('/api/') || fileName.includes('api') || fileName.includes('Api')) {
            decisions.push({
                pattern: 'API Layer Pattern',
                evidence: [
                    `File in /api/ directory or contains "api": ${filePath}`,
                    `Dependencies: ${dependencies.length} dependencies`,
                    `Symbols: ${symbols.length} symbols`
                ],
                confidence: 'high',
                suggested_adr_title: `API Layer: ${filePath}`,
                existing_adrs: existingAdrNumbers
            });
        }

        // Pattern: Builder Pattern
        if (fileName.includes('builder') || fileName.includes('Builder')) {
            decisions.push({
                pattern: 'Builder Pattern',
                evidence: [
                    `File name contains "builder": ${fileName}`,
                    `Module path: ${filePath}`
                ],
                confidence: 'high',
                suggested_adr_title: `Builder Pattern: ${filePath}`,
                existing_adrs: existingAdrNumbers
            });
        }

        // Pattern: Factory Pattern
        if (fileName.includes('factory') || fileName.includes('Factory')) {
            decisions.push({
                pattern: 'Factory Pattern',
                evidence: [
                    `File name contains "factory": ${fileName}`,
                    `Module path: ${filePath}`
                ],
                confidence: 'high',
                suggested_adr_title: `Factory Pattern: ${filePath}`,
                existing_adrs: existingAdrNumbers
            });
        }

        // Pattern: Service Layer
        if (filePath.includes('/services/')) {
            decisions.push({
                pattern: 'Service Layer Pattern',
                evidence: [
                    `File in /services/ directory: ${filePath}`,
                    `Dependencies: ${dependencies.length} dependencies`
                ],
                confidence: 'medium',
                suggested_adr_title: `Service Layer: ${filePath}`,
                existing_adrs: existingAdrNumbers
            });
        }

        // Pattern: Layered Architecture (based on directory structure)
        const layers = this.detectLayers(filePath);
        if (layers.length > 0) {
            decisions.push({
                pattern: 'Layered Architecture',
                evidence: [
                    `Directory structure suggests layers: ${layers.join(' → ')}`,
                    `File path: ${filePath}`
                ],
                confidence: 'medium',
                suggested_adr_title: `Layered Architecture: ${layers.join(' → ')}`,
                existing_adrs: existingAdrNumbers
            });
        }

        return decisions;
    }

    /**
     * Recognizes system-wide patterns.
     */
    private recognizeSystemPatterns(
        modules: any[],
        allAdrs: any[]
    ): Array<{
        pattern: string;
        evidence: string[];
        confidence: 'high' | 'medium' | 'low';
        suggested_adr_title: string;
        existing_adrs: string[];
    }> {
        const decisions: Array<{
            pattern: string;
            evidence: string[];
            confidence: 'high' | 'medium' | 'low';
            suggested_adr_title: string;
            existing_adrs: string[];
        }> = [];

        // Count patterns across all modules
        const repositoryCount = modules.filter(m => 
            m.file_path.includes('repository') || m.file_path.includes('Repository')
        ).length;
        
        const apiCount = modules.filter(m => 
            m.file_path.includes('/api/')
        ).length;
        
        const serviceCount = modules.filter(m => 
            m.file_path.includes('/services/')
        ).length;

        // System-wide: Repository Pattern
        if (repositoryCount > 0) {
            decisions.push({
                pattern: 'Repository Pattern (System-wide)',
                evidence: [
                    `${repositoryCount} modules with "repository" in name/path`,
                    `Pattern used consistently across system`
                ],
                confidence: repositoryCount >= 3 ? 'high' : 'medium',
                suggested_adr_title: 'Repository Pattern - System-wide Implementation',
                existing_adrs: this.findRelevantAdrs(allAdrs, 'repository')
            });
        }

        // System-wide: API Layer
        if (apiCount > 0) {
            decisions.push({
                pattern: 'API Layer Pattern (System-wide)',
                evidence: [
                    `${apiCount} modules in /api/ directory`,
                    `Clear separation of API layer`
                ],
                confidence: apiCount >= 3 ? 'high' : 'medium',
                suggested_adr_title: 'API Layer - System-wide Architecture',
                existing_adrs: this.findRelevantAdrs(allAdrs, 'api')
            });
        }

        // System-wide: Service Layer
        if (serviceCount > 0) {
            decisions.push({
                pattern: 'Service Layer Pattern (System-wide)',
                evidence: [
                    `${serviceCount} modules in /services/ directory`,
                    `Business logic separated from API layer`
                ],
                confidence: serviceCount >= 3 ? 'high' : 'medium',
                suggested_adr_title: 'Service Layer - System-wide Architecture',
                existing_adrs: this.findRelevantAdrs(allAdrs, 'service')
            });
        }

        // Detect layered architecture
        const layerStructure = this.detectSystemLayers(modules);
        if (layerStructure.layers.length > 0) {
            decisions.push({
                pattern: 'Layered Architecture (System-wide)',
                evidence: [
                    `Detected layers: ${layerStructure.layers.join(' → ')}`,
                    `${layerStructure.moduleCount} modules follow this structure`
                ],
                confidence: layerStructure.moduleCount >= 10 ? 'high' : 'medium',
                suggested_adr_title: 'Layered Architecture - System Structure',
                existing_adrs: this.findRelevantAdrs(allAdrs, 'layer')
            });
        }

        return decisions;
    }

    /**
     * Detects layers from file path.
     */
    private detectLayers(filePath: string): string[] {
        const layers: string[] = [];
        const pathParts = filePath.split('/');
        
        // Common layer patterns
        if (pathParts.includes('core')) layers.push('Core');
        if (pathParts.includes('api')) layers.push('API');
        if (pathParts.includes('services')) layers.push('Services');
        if (pathParts.includes('repositories')) layers.push('Repositories');
        if (pathParts.includes('models')) layers.push('Models');
        if (pathParts.includes('ui')) layers.push('UI');
        if (pathParts.includes('mcp')) layers.push('MCP');
        
        return layers;
    }

    /**
     * Detects system-wide layer structure.
     */
    private detectSystemLayers(modules: any[]): { layers: string[]; moduleCount: number } {
        const layerCounts = new Map<string, number>();
        
        for (const module of modules) {
            const layers = this.detectLayers(module.file_path);
            for (const layer of layers) {
                layerCounts.set(layer, (layerCounts.get(layer) || 0) + 1);
            }
        }
        
        // Sort by count and return top layers
        const sortedLayers = Array.from(layerCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([layer]) => layer);
        
        return {
            layers: sortedLayers,
            moduleCount: modules.length
        };
    }

    /**
     * Finds relevant ADRs by searching titles and content.
     */
    private findRelevantAdrs(allAdrs: any[], keyword: string): string[] {
        return allAdrs
            .filter(adr => 
                adr.title.toLowerCase().includes(keyword.toLowerCase()) ||
                adr.content_markdown.toLowerCase().includes(keyword.toLowerCase())
            )
            .map(adr => adr.adr_number);
    }
}

