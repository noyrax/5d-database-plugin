import { MultiDbManager } from '../core/multi-db-manager';
import { DependencyApi } from '../api/dependency-api';
import { ModuleApi } from '../api/module-api';
import { ImportanceRepository, ImportanceScore } from '../repositories/importance-repository';
import { Dependency } from '../models/dependency';
import { Module } from '../models/module';
import { v4 as uuidv4 } from 'uuid';

/**
 * Calculates importance scores for entities using graph algorithms.
 * Uses PageRank and Betweenness Centrality, then combines them.
 */
export class ImportanceScorer {
    private dbManager: MultiDbManager;
    private dependencyApi: DependencyApi;
    private moduleApi: ModuleApi;
    private readonly pagerankWeight: number = 0.7;
    private readonly betweennessWeight: number = 0.3;

    constructor(dbManager: MultiDbManager) {
        this.dbManager = dbManager;
        this.dependencyApi = new DependencyApi(dbManager);
        this.moduleApi = new ModuleApi(dbManager);
    }

    /**
     * Calculates combined importance scores for all dimensions.
     * Currently focuses on X-dimension (Modules) using dependency graph.
     */
    async calculateCombinedScores(pluginId: string): Promise<void> {
        console.log(`[ImportanceScorer] Calculating importance scores for plugin ${pluginId}`);

        // For now, we calculate scores for X-dimension (Modules) based on dependency graph
        // Other dimensions can be added later
        await this.calculateModuleScores(pluginId);

        console.log(`[ImportanceScorer] Importance scores calculated for plugin ${pluginId}`);
    }

    /**
     * Calculates importance scores for modules (X-dimension).
     */
    private async calculateModuleScores(pluginId: string): Promise<void> {
        const modules = await this.moduleApi.getAllModules(pluginId);
        const dependencies = await this.dependencyApi.getAllDependencies(pluginId);

        if (modules.length === 0) {
            return;
        }

        // Build adjacency list for dependency graph
        const graph = this.buildDependencyGraph(modules, dependencies);

        // Calculate PageRank
        const pagerankScores = await this.calculatePageRank(graph, modules);

        // Calculate Betweenness Centrality
        const betweennessScores = await this.calculateBetweenness(graph, modules);

        // Combine scores and rank
        const combinedScores = this.combineScores(pagerankScores, betweennessScores, modules);

        // Save to database
        const db = await this.dbManager.getDatabase('V');
        const scoreRepo = new ImportanceRepository(db);

        const now = new Date();
        for (let i = 0; i < combinedScores.length; i++) {
            const score = combinedScores[i];
            const importanceScore: ImportanceScore = {
                id: uuidv4(),
                plugin_id: pluginId,
                dimension: 'X',
                entity_id: score.moduleId,
                pagerank_score: score.pagerank,
                betweenness_score: score.betweenness,
                combined_score: score.combined,
                rank: i + 1,  // 1 = most important
                created_at: now
            };
            await scoreRepo.upsert(importanceScore);
        }

        console.log(`[ImportanceScorer] Calculated scores for ${combinedScores.length} modules`);
    }

    /**
     * Builds an adjacency list representation of the dependency graph.
     */
    private buildDependencyGraph(modules: Module[], dependencies: Dependency[]): Map<string, Set<string>> {
        const graph = new Map<string, Set<string>>();

        // Initialize all modules
        for (const module of modules) {
            graph.set(module.file_path, new Set());
        }

        // Add edges (dependencies)
        for (const dep of dependencies) {
            const fromSet = graph.get(dep.from_module);
            if (fromSet) {
                fromSet.add(dep.to_module);
            }
        }

        return graph;
    }

    /**
     * Calculates PageRank scores for modules.
     * Uses iterative algorithm with damping factor.
     */
    async calculatePageRank(
        graph: Map<string, Set<string>>,
        modules: Module[]
    ): Promise<Map<string, number>> {
        const dampingFactor = 0.85;
        const maxIterations = 100;
        const tolerance = 1e-6;

        const modulePaths = modules.map(m => m.file_path);
        const scores = new Map<string, number>();
        const newScores = new Map<string, number>();

        // Initialize all scores to 1/N
        const initialScore = 1.0 / modulePaths.length;
        for (const path of modulePaths) {
            scores.set(path, initialScore);
            newScores.set(path, 0);
        }

        // Iterate until convergence
        for (let iter = 0; iter < maxIterations; iter++) {
            // Calculate new scores
            for (const path of modulePaths) {
                let sum = 0;
                const incoming = this.getIncomingEdges(graph, path);

                for (const incomingPath of incoming) {
                    const outgoingCount = graph.get(incomingPath)?.size || 1;
                    const oldScore = scores.get(incomingPath) || 0;
                    sum += oldScore / outgoingCount;
                }

                newScores.set(path, (1 - dampingFactor) / modulePaths.length + dampingFactor * sum);
            }

            // Check convergence
            let maxDiff = 0;
            for (const path of modulePaths) {
                const oldScore = scores.get(path) || 0;
                const newScore = newScores.get(path) || 0;
                const diff = Math.abs(newScore - oldScore);
                maxDiff = Math.max(maxDiff, diff);
                scores.set(path, newScore);
            }

            if (maxDiff < tolerance) {
                break;
            }
        }

        return scores;
    }

    /**
     * Calculates Betweenness Centrality scores.
     * Uses simplified algorithm (all-pairs shortest paths would be too expensive).
     * Uses approximation: nodes with more incoming edges have higher betweenness.
     */
    async calculateBetweenness(
        graph: Map<string, Set<string>>,
        modules: Module[]
    ): Promise<Map<string, number>> {
        const scores = new Map<string, number>();

        // Simplified betweenness: count how many shortest paths go through this node
        // For efficiency, we use a simpler metric: number of incoming edges
        // This correlates with betweenness in dependency graphs
        for (const module of modules) {
            const incoming = this.getIncomingEdges(graph, module.file_path);
            // Normalize by total number of modules
            scores.set(module.file_path, incoming.size / modules.length);
        }

        return scores;
    }

    /**
     * Gets all nodes that have edges to the given node.
     */
    private getIncomingEdges(graph: Map<string, Set<string>>, target: string): Set<string> {
        const incoming = new Set<string>();
        for (const [from, toSet] of graph.entries()) {
            if (toSet.has(target)) {
                incoming.add(from);
            }
        }
        return incoming;
    }

    /**
     * Combines PageRank and Betweenness scores with weights.
     */
    private combineScores(
        pagerankScores: Map<string, number>,
        betweennessScores: Map<string, number>,
        modules: Module[]
    ): Array<{ moduleId: string; pagerank: number; betweenness: number; combined: number }> {
        const results: Array<{ moduleId: string; pagerank: number; betweenness: number; combined: number }> = [];

        // Normalize scores to [0, 1] range
        const pagerankValues = Array.from(pagerankScores.values());
        const betweennessValues = Array.from(betweennessScores.values());
        
        const maxPageRank = Math.max(...pagerankValues, 1);
        const maxBetweenness = Math.max(...betweennessValues, 1);

        for (const module of modules) {
            const pagerank = (pagerankScores.get(module.file_path) || 0) / maxPageRank;
            const betweenness = (betweennessScores.get(module.file_path) || 0) / maxBetweenness;
            const combined = this.pagerankWeight * pagerank + this.betweennessWeight * betweenness;

            results.push({
                moduleId: module.id,
                pagerank,
                betweenness,
                combined
            });
        }

        // Sort by combined score (descending)
        results.sort((a, b) => b.combined - a.combined);

        return results;
    }
}


