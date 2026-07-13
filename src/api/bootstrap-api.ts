import { MultiDbManager } from '../core/multi-db-manager';
import { SelfExplanationApi } from './self-explanation-api';
import { EntityReference } from '../models/entity-reference';
import { Evidence } from '../models/evidence';
import { AdrApi } from './adr-api';
import { SymbolApi } from './symbol-api';
import { ModuleApi } from './module-api';
import { NavigationRepository } from '../repositories/navigation-repository';

/**
 * Bootstrap information for first-time system understanding.
 * Provides everything an agent needs to start without prior knowledge.
 */
export interface BootstrapInfo {
    what_am_i: string;
    how_do_i_work: string;
    where_to_start: Array<{
        entity: EntityReference;
        reason: string;
    }>;
    how_to_navigate: string;
    example_queries: string[];
    dimensions_overview: Array<{
        id: 'X' | 'Y' | 'Z' | 'W' | 'T' | 'V';
        name: string;
        description: string;
    }>;
    tools_available: Array<{
        name: string;
        description: string;
        example: any;
    }>;
    evidence?: Evidence;
}

import { EvidenceGrader } from './evidence-grader';

/**
 * Bootstrap API - first point of contact for agents without prior knowledge.
 * Provides system description, entry points, and example queries.
 */
export class BootstrapApi {
    private dbManager: MultiDbManager;
    private selfExplanationApi: SelfExplanationApi;
    private evidenceGrader: EvidenceGrader;
    private adrApi: AdrApi;
    private symbolApi: SymbolApi;
    private moduleApi: ModuleApi;

    constructor(dbManager: MultiDbManager) {
        this.dbManager = dbManager;
        this.selfExplanationApi = new SelfExplanationApi(dbManager);
        this.evidenceGrader = new EvidenceGrader();
        this.adrApi = new AdrApi(dbManager);
        this.symbolApi = new SymbolApi(dbManager);
        this.moduleApi = new ModuleApi(dbManager);
    }

    /**
     * Gets bootstrap information for first-time system understanding.
     * 
     * @param pluginId Plugin ID
     * @returns Promise that resolves to bootstrap information
     */
    async getBootstrapInfo(pluginId: string): Promise<BootstrapInfo> {
        // Get system explanation
        const systemExplanation = await this.selfExplanationApi.explainSystem(pluginId);
        
        // Prüfung: Sind Daten vorhanden? (entry_points ODER dimensions entity_count > 0)
        const hasData = systemExplanation.entry_points.length > 0 || 
                       systemExplanation.dimensions.some(d => (d.entity_count || 0) > 0);
        
        // Get entry points with reasons
        const entryPoints = systemExplanation.entry_points.map(ep => ({
            entity: {
                dimension: ep.dimension,
                entity_id: ep.entity_id,
                external_id: ep.external_id
            },
            reason: ep.reason || 'Entry point'
        }));
        
        // how_to_navigate beschreibt den Mechanismus (5D views + Tools), nicht die Identität
        let howToNavigate: string;
        if (hasData) {
            // Mode B: Has Data - Mechanismus-Beschreibung
            howToNavigate = `Use semantic_discovery tool with natural language queries. The system will find relevant entities and provide structured context from all 6 dimensions (X: Modules, Y: Symbols, Z: Dependencies, W: ADRs, T: Changes, V: Embeddings).`;
        } else {
            // Mode A: No Data (First Run) - Initialisierungs-Anweisungen
            howToNavigate = `To get started, use 'workflow_ensure_ready' to automatically generate documentation and populate the databases. Alternatively, use 'workflow_full_cycle' for a complete workflow (Scan → Generate → Validate → Ingest → Embeddings) or 'workflow_generate_and_ingest' for a simpler workflow (Generate → Ingest).`;
        }
        
        // Create evidence: INFERRED from system explanation (which is derived from DB queries)
        const evidence = this.evidenceGrader.gradeAsInferred(
            [
                {
                    type: 'DB_QUERY',
                    path: 'system_explanation'
                }
            ],
            'Bootstrap information derived from system explanation, which aggregates data from multiple database queries'
        );

        // Generate dynamic example queries based on actual system data
        const exampleQueries = await this.generateExampleQueries(pluginId, entryPoints);

        return {
            what_am_i: systemExplanation.what_am_i,  // Die Codebase (Name/Desc)
            how_do_i_work: systemExplanation.how_do_i_work,  // System facts (was ist in der Codebase)
            where_to_start: entryPoints,
            how_to_navigate: howToNavigate,  // Mechanismus (5D-System als Tool), nicht Identität
            example_queries: exampleQueries,
            dimensions_overview: systemExplanation.dimensions.map(dim => ({
                id: dim.id,
                name: dim.name,
                description: dim.description
            })),
            tools_available: [
                {
                    name: 'semantic_discovery',
                    description: 'Semantic search and context retrieval for LLM understanding',
                    example: {
                        query: 'How does ingestion work?',
                        pluginId
                    }
                },
                {
                    name: 'system_explanation',
                    description: 'Get system overview, entry points, and architecture ADRs',
                    example: {
                        pluginId
                    }
                },
                {
                    name: 'learning_path',
                    description: 'Generate guided learning path for understanding a topic',
                    example: {
                        topic: 'ingestion',
                        pluginId
                    }
                },
                {
                    name: 'bootstrap',
                    description: 'Get bootstrap information for first-time system understanding (no prior knowledge required)',
                    example: {
                        pluginId
                    }
                }
            ],
            evidence
        };
    }

    /**
     * Generates dynamic example queries based on actual system data:
     * - Entry Points (module names)
     * - ADR Titles
     * - Most common symbol names
     * - Cluster names
     * 
     * Falls back to generic queries if no data is available.
     */
    private async generateExampleQueries(
        pluginId: string,
        entryPoints: Array<{ entity: EntityReference; reason: string }>
    ): Promise<string[]> {
        const queries: string[] = [];
        
        try {
            // 1. Entry Points: Generate queries from entry point module names
            if (entryPoints.length > 0) {
                const entryPointModules = entryPoints
                    .filter(ep => ep.entity.dimension === 'X')
                    .slice(0, 3); // Max 3 entry points
                
                for (const ep of entryPointModules) {
                    const moduleName = this.extractModuleName(ep.entity.external_id);
                    if (moduleName) {
                        queries.push(`How does ${moduleName} work?`);
                    }
                }
            }

            // 2. ADR Titles: Generate queries from ADR titles
            try {
                const adrs = await this.adrApi.getAllAdrs(pluginId);
                if (adrs.length > 0) {
                    // Take first 2-3 ADRs and generate queries
                    const selectedAdrs = adrs.slice(0, 3);
                    for (const adr of selectedAdrs) {
                        // Extract key topic from ADR title
                        const topic = this.extractTopicFromAdrTitle(adr.title);
                        if (topic) {
                            queries.push(`What is ${topic}?`);
                        }
                    }
                }
            } catch (error) {
                // Ignore errors, fall back to generic queries
            }

            // 3. Most common symbol names: Generate queries from frequently used symbols
            try {
                const symbols = await this.symbolApi.getAllSymbols(pluginId);
                if (symbols.length > 0) {
                    // Count symbol name frequency
                    const symbolCounts = new Map<string, number>();
                    for (const symbol of symbols) {
                        const name = symbol.name;
                        symbolCounts.set(name, (symbolCounts.get(name) || 0) + 1);
                    }
                    
                    // Get top 3 most common symbol names
                    const topSymbols = Array.from(symbolCounts.entries())
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 3)
                        .map(([name]) => name);
                    
                    for (const symbolName of topSymbols) {
                        queries.push(`What is ${symbolName}?`);
                    }
                }
            } catch (error) {
                // Ignore errors, fall back to generic queries
            }

            // 4. Cluster names: Generate queries from cluster names
            try {
                const db = await this.dbManager.getDatabase('V');
                const navRepo = new NavigationRepository(db);
                const allMetadata = await navRepo.getAll(pluginId);
                
                // Extract unique cluster IDs
                const clusterIds = new Set<string>();
                for (const metadata of allMetadata) {
                    if (metadata.cluster_id) {
                        clusterIds.add(metadata.cluster_id);
                    }
                }
                
                // Generate queries from cluster names (extract directory/component name)
                const clusterNames = Array.from(clusterIds).slice(0, 2);
                for (const clusterId of clusterNames) {
                    const clusterName = this.extractClusterName(clusterId);
                    if (clusterName) {
                        queries.push(`What is the ${clusterName} component?`);
                    }
                }
            } catch (error) {
                // Ignore errors, fall back to generic queries
            }

            // 5. Add generic fallback queries if we don't have enough
            const genericQueries = [
                'What are the main components?',
                'What is the architecture?',
                'How do dependencies work?',
                'What are the entry points?',
                'How do I navigate the codebase?'
            ];

            // Fill up to 8 queries total (mix of dynamic and generic)
            while (queries.length < 8 && genericQueries.length > 0) {
                const generic = genericQueries.shift();
                if (generic && !queries.includes(generic)) {
                    queries.push(generic);
                }
            }

            // Limit to 8 queries max
            return queries.slice(0, 8);
        } catch (error) {
            // Fallback to generic queries if anything fails
            return [
                'What are the main components?',
                'What is the architecture?',
                'How do dependencies work?',
                'What are the entry points?',
                'How do I navigate the codebase?',
                'How does the system work?',
                'What are the key modules?',
                'How do I get started?'
            ];
        }
    }

    /**
     * Extracts module name from file path.
     * Example: "src/api/bootstrap-api.ts" -> "bootstrap-api"
     */
    private extractModuleName(filePath: string): string | null {
        if (!filePath) return null;
        
        // Extract filename without extension
        const fileName = filePath.split('/').pop() || filePath.split('\\').pop() || '';
        const nameWithoutExt = fileName.replace(/\.(ts|js|tsx|jsx)$/, '');
        
        // Convert kebab-case or snake_case to readable name
        return nameWithoutExt
            .replace(/[-_]/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase())
            .trim() || null;
    }

    /**
     * Extracts topic from ADR title.
     * Example: "ADR-040: Unified MCP Server" -> "Unified MCP Server"
     */
    private extractTopicFromAdrTitle(title: string): string | null {
        if (!title) return null;
        
        // Remove ADR number prefix (e.g., "ADR-040: " or "040: ")
        const cleaned = title.replace(/^ADR-\d+:\s*/i, '').replace(/^\d+:\s*/, '');
        
        // Extract first meaningful phrase (before dash or colon if present)
        const topic = cleaned.split(/[-–—]/)[0].split(':')[0].trim();
        
        return topic || null;
    }

    /**
     * Extracts cluster name from cluster ID.
     * Example: "cluster:src/api" -> "API"
     */
    private extractClusterName(clusterId: string): string | null {
        if (!clusterId) return null;
        
        // Remove "cluster:" prefix
        const cleaned = clusterId.replace(/^cluster:/, '');
        
        // Extract last directory name (most meaningful)
        const parts = cleaned.split('/').filter(p => p);
        if (parts.length === 0) return null;
        
        const lastPart = parts[parts.length - 1];
        
        // Convert to readable name
        return lastPart
            .replace(/[-_]/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase())
            .trim() || null;
    }
}


