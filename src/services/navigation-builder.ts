import { MultiDbManager } from '../core/multi-db-manager';
import { ModuleApi } from '../api/module-api';
import { DependencyApi } from '../api/dependency-api';
import { AdrApi } from '../api/adr-api';
import { ImportanceRepository } from '../repositories/importance-repository';
import { NavigationRepository, EntryPointRepository } from '../repositories/navigation-repository';
import { Module } from '../models/module';
import { Dependency } from '../models/dependency';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';

/**
 * Builds navigation metadata: entry points, clusters, and ADR links.
 */
export class NavigationBuilder {
    private dbManager: MultiDbManager;
    private moduleApi: ModuleApi;
    private dependencyApi: DependencyApi;
    private adrApi: AdrApi;

    constructor(dbManager: MultiDbManager) {
        this.dbManager = dbManager;
        this.moduleApi = new ModuleApi(dbManager);
        this.dependencyApi = new DependencyApi(dbManager);
        this.adrApi = new AdrApi(dbManager);
    }

    /**
     * Builds all navigation metadata for a plugin.
     */
    async buildMetadata(pluginId: string): Promise<void> {
        console.log(`[NavigationBuilder] Building navigation metadata for plugin ${pluginId}`);

        await this.identifyEntryPoints(pluginId);
        await this.linkRelatedAdrs(pluginId);
        await this.buildClusters(pluginId);

        console.log(`[NavigationBuilder] Navigation metadata built for plugin ${pluginId}`);
    }

    /**
     * Checks if a table exists in the database.
     */
    private async checkTableExists(db: any, tableName: string): Promise<boolean> {
        return new Promise((resolve, reject) => {
            db.get(
                "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
                [tableName],
                (err: Error | null, row: any) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(row !== null && row !== undefined);
                    }
                }
            );
        });
    }

    /**
     * Identifies entry points (automatically + manually).
     */
    async identifyEntryPoints(pluginId: string): Promise<void> {
        console.log(`[NavigationBuilder] Identifying entry points for plugin ${pluginId}`);

        const db = await this.dbManager.getDatabase('V');
        
        // Check if navigation_metadata table exists
        const tableExists = await this.checkTableExists(db, 'navigation_metadata');
        if (!tableExists) {
            console.error('[NavigationBuilder] ERROR: navigation_metadata table does not exist. Migration may have failed.');
            console.error('[NavigationBuilder] Please run migration for V-dimension: npm run ingest');
            throw new Error('navigation_metadata table does not exist. Please run migration first.');
        }
        
        const navRepo = new NavigationRepository(db);
        const entryPointRepo = new EntryPointRepository(db);
        const importanceRepo = new ImportanceRepository(db);

        // Get modules (X-dimension)
        const modules = await this.moduleApi.getAllModules(pluginId);
        const dependencies = await this.dependencyApi.getAllDependencies(pluginId);

        // Get importance scores
        const importanceScores = await importanceRepo.getAllByDimension('X', pluginId);
        const importanceMap = new Map<string, number>();
        for (const score of importanceScores) {
            importanceMap.set(score.entity_id, score.combined_score);
        }

        // Get manual entry points
        const manualEntryPoints = await entryPointRepo.getAllByDimension('X', pluginId);
        const manualEntryPointSet = new Set(manualEntryPoints.map(ep => ep.entity_id));

        // Build incoming dependency map
        const incomingDeps = new Map<string, number>();
        for (const dep of dependencies) {
            const count = incomingDeps.get(dep.to_module) || 0;
            incomingDeps.set(dep.to_module, count + 1);
        }

        const now = new Date();
        
        // Calculate entry point candidates
        // Strategy: Multiple criteria for automatic identification
        const entryPointCandidates: Array<{ module: Module; score: number; reason: string }> = [];
        
        // Get top importance scores for ranking
        const sortedScores = Array.from(importanceScores)
            .sort((a, b) => b.combined_score - a.combined_score);
        const topScore = sortedScores.length > 0 ? sortedScores[0].combined_score : 0;
        const top10PercentScore = sortedScores.length > 0 
            ? sortedScores[Math.floor(sortedScores.length * 0.1)].combined_score 
            : 0;
        const medianScore = sortedScores.length > 0 
            ? sortedScores[Math.floor(sortedScores.length / 2)].combined_score 
            : 0;

        // Identify entry points
        for (const module of modules) {
            const importanceScore = importanceMap.get(module.id) || 0;
            const incomingCount = incomingDeps.get(module.file_path) || 0;
            const isManual = manualEntryPointSet.has(module.id);
            
            // Count outgoing dependencies
            const outgoingCount = dependencies.filter(d => d.from_module === module.file_path).length;

            // Get importance rank
            const score = importanceScores.find(s => s.entity_id === module.id);
            const importanceRank = score ? score.rank : null;

            // Automatic criteria (multiple strategies, prioritized):
            let isEntryPoint = isManual;
            let reason = '';

            if (isManual) {
                reason = 'Manual entry point';
            } else {
                // Strategy 1: Top 20 modules by importance rank (most reliable, strict limit)
                if (importanceRank !== null && importanceRank <= 20) {
                    isEntryPoint = true;
                    reason = `Top 20 by importance rank (rank ${importanceRank})`;
                }
                // Strategy 2: Top 10% by importance score AND (no incoming deps OR hub module)
                // Only if not already selected by Strategy 1
                else if (importanceScore >= top10PercentScore && importanceScore > 0) {
                    if (incomingCount === 0) {
                        isEntryPoint = true;
                        reason = 'Top 10% importance, no incoming dependencies';
                    } else if (outgoingCount >= 5) {
                        isEntryPoint = true;
                        reason = `Top 10% importance, hub module (${outgoingCount} outgoing)`;
                    }
                }
                // Strategy 3: Root modules (no incoming dependencies) with above-median importance
                // Only if not already selected
                else if (incomingCount === 0 && importanceScore > medianScore && importanceScore > 0) {
                    isEntryPoint = true;
                    reason = 'Root module, above-median importance';
                }
                // Strategy 4: Important hub modules (many outgoing dependencies, above-median importance)
                // Only if not already selected
                else if (outgoingCount >= 5 && importanceScore > medianScore && importanceScore > 0) {
                    isEntryPoint = true;
                    reason = `Hub module (${outgoingCount} outgoing dependencies)`;
                }
            }

            if (isEntryPoint) {
                entryPointCandidates.push({
                    module,
                    score: importanceScore,
                    reason
                });
            }

            // Get or create navigation metadata
            let metadata = await navRepo.getByEntity('X', module.id, pluginId);
            if (!metadata) {
                metadata = {
                    id: uuidv4(),
                    plugin_id: pluginId,
                    dimension: 'X',
                    entity_id: module.id,
                    is_entry_point: isEntryPoint,
                    cluster_id: null,
                    related_adrs: '[]',
                    importance_rank: null,
                    created_at: now
                };
            } else {
                metadata.is_entry_point = isEntryPoint;
            }

            // Set importance rank if available
            const importanceScoreRecord = importanceScores.find(s => s.entity_id === module.id);
            if (importanceScoreRecord) {
                metadata.importance_rank = importanceScoreRecord.rank;
            }

            await navRepo.upsert(metadata);
        }

        const entryPointCount = entryPointCandidates.length;
        console.log(`[NavigationBuilder] Identified ${entryPointCount} entry points for ${modules.length} modules`);
        if (entryPointCount > 0) {
            console.log(`[NavigationBuilder] Entry point reasons: ${Array.from(new Set(entryPointCandidates.map(c => c.reason))).join(', ')}`);
        }
    }

    /**
     * Links entities with related ADRs.
     */
    async linkRelatedAdrs(pluginId: string): Promise<void> {
        console.log(`[NavigationBuilder] Linking related ADRs for plugin ${pluginId}`);

        const db = await this.dbManager.getDatabase('V');
        const navRepo = new NavigationRepository(db);
        const adrRepo = await this.dbManager.getDatabase('W');
        const { AdrRepository } = await import('../repositories/adr-repository');
        const adrRepository = new AdrRepository(adrRepo);

        // Get all modules
        const modules = await this.moduleApi.getAllModules(pluginId);

        // Get all ADR file mappings
        const allAdrs = await this.adrApi.getAllAdrs(pluginId);
        const fileToAdrs = new Map<string, string[]>();  // file_path -> [adr_numbers]

        for (const adr of allAdrs) {
            const mappings = await adrRepository.getAdrFileMappings(adr.id);
            for (const mapping of mappings) {
                if (!fileToAdrs.has(mapping.file_path)) {
                    fileToAdrs.set(mapping.file_path, []);
                }
                fileToAdrs.get(mapping.file_path)!.push(adr.adr_number);
            }
        }

        // Link modules to ADRs
        const now = new Date();
        for (const module of modules) {
            const relatedAdrNumbers = fileToAdrs.get(module.file_path) || [];
            
            let metadata = await navRepo.getByEntity('X', module.id, pluginId);
            if (!metadata) {
                metadata = {
                    id: uuidv4(),
                    plugin_id: pluginId,
                    dimension: 'X',
                    entity_id: module.id,
                    is_entry_point: false,
                    cluster_id: null,
                    related_adrs: JSON.stringify(relatedAdrNumbers),
                    importance_rank: null,
                    created_at: now
                };
            } else {
                metadata.related_adrs = JSON.stringify(relatedAdrNumbers);
            }

            await navRepo.upsert(metadata);
        }

        console.log(`[NavigationBuilder] Linked ADRs for ${modules.length} modules`);
    }

    /**
     * Groups related entities into clusters.
     * Uses directory structure for clustering.
     */
    async buildClusters(pluginId: string): Promise<void> {
        console.log(`[NavigationBuilder] Building clusters for plugin ${pluginId}`);

        const db = await this.dbManager.getDatabase('V');
        const navRepo = new NavigationRepository(db);

        // Get all modules
        const modules = await this.moduleApi.getAllModules(pluginId);

        // Cluster by directory (e.g., src/core/, src/api/, etc.)
        const clusterMap = new Map<string, string>();  // file_path -> cluster_id
        const clusters = new Map<string, string[]>();  // cluster_id -> [file_paths]

        for (const module of modules) {
            const dir = path.dirname(module.file_path);
            const clusterId = `cluster:${dir}`;

            if (!clusters.has(clusterId)) {
                clusters.set(clusterId, []);
            }
            clusters.get(clusterId)!.push(module.file_path);
            clusterMap.set(module.file_path, clusterId);
        }

        // Update navigation metadata with cluster IDs
        const now = new Date();
        for (const module of modules) {
            const clusterId = clusterMap.get(module.file_path) || null;

            let metadata = await navRepo.getByEntity('X', module.id, pluginId);
            if (!metadata) {
                metadata = {
                    id: uuidv4(),
                    plugin_id: pluginId,
                    dimension: 'X',
                    entity_id: module.id,
                    is_entry_point: false,
                    cluster_id: clusterId,
                    related_adrs: '[]',
                    importance_rank: null,
                    created_at: now
                };
            } else {
                metadata.cluster_id = clusterId;
            }

            await navRepo.upsert(metadata);
        }

        console.log(`[NavigationBuilder] Built ${clusters.size} clusters for ${modules.length} modules`);
    }
}


