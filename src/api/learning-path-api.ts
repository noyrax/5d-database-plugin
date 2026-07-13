import { MultiDbManager } from '../core/multi-db-manager';
import { IdMapper } from '../core/id-mapper';
import { SemanticSearchApi, SemanticSearchResult } from './semantic-search-api';
import { DependencyApi } from './dependency-api';
import { ModuleApi } from './module-api';
import { AdrApi } from './adr-api';
import { NavigationRepository } from '../repositories/navigation-repository';
import { EntityReference } from '../models/entity-reference';
import { Module } from '../models/module';
import { Dependency } from '../models/dependency';
import { Evidence } from '../models/evidence';
import { EvidenceGrader } from './evidence-grader';

/**
 * Learning path step
 */
export interface LearningPathStep {
    step: number;
    entity: EntityReference;
    action: 'read' | 'study' | 'examine' | 'understand';
    reason: string;
}

/**
 * Learning path
 */
export interface LearningPath {
    topic: string;
    path: LearningPathStep[];
    estimated_time?: string;  // e.g., "5-10 minutes"
    evidence?: Evidence;
}

/**
 * Generates guided learning paths for agents.
 * Provides step-by-step guidance based on topic/query.
 */
export class LearningPathApi {
    private dbManager: MultiDbManager;
    private semanticSearchApi: SemanticSearchApi;
    private dependencyApi: DependencyApi;
    private moduleApi: ModuleApi;
    private adrApi: AdrApi;
    private evidenceGrader: EvidenceGrader;

    constructor(
        dbManager: MultiDbManager,
        semanticSearchApi: SemanticSearchApi
    ) {
        this.dbManager = dbManager;
        this.semanticSearchApi = semanticSearchApi;
        this.dependencyApi = new DependencyApi(dbManager);
        this.moduleApi = new ModuleApi(dbManager);
        this.adrApi = new AdrApi(dbManager);
        this.evidenceGrader = new EvidenceGrader();
    }

    /**
     * Generates a learning path for a topic.
     * 
     * @param topic Topic to learn about (e.g., "ingestion", "dependencies")
     * @param pluginId Plugin ID
     * @returns Promise that resolves to a learning path
     */
    async generateLearningPath(
        topic: string,
        pluginId: string
    ): Promise<LearningPath> {
        // 1. Semantic search for topic
        const relevantEntities = await this.semanticSearchApi.search(topic, pluginId, {
            limit: 20
        });

        if (relevantEntities.length === 0) {
            return {
                topic,
                path: [],
                estimated_time: '0 minutes'
            };
        }

        // 2. Find entry points (ADRs, Core-Modules)
        const entryPoints = await this.findEntryPoints(relevantEntities, pluginId);

        // 3. Build dependency path (from entry points to relevant entities)
        const path = await this.buildDependencyPath(entryPoints, relevantEntities, pluginId);

        // 4. Estimate time (rough: 2-3 minutes per step)
        const estimatedTime = path.length > 0 ? `${path.length * 2}-${path.length * 3} minutes` : '0 minutes';

        // Create evidence: INFERRED from semantic search and dependency analysis
        const evidence = this.evidenceGrader.gradeAsInferred(
            [
                {
                    type: 'DB_QUERY',
                    path: 'semantic_search'
                },
                {
                    type: 'DB_QUERY',
                    path: 'dependency_analysis'
                }
            ],
            'Learning path derived from semantic search results and dependency analysis'
        );

        return {
            topic,
            path,
            estimated_time: estimatedTime,
            evidence
        };
    }

    /**
     * Finds entry points from relevant entities.
     */
    private async findEntryPoints(
        entities: SemanticSearchResult[],
        pluginId: string
    ): Promise<EntityReference[]> {
        const db = await this.dbManager.getDatabase('V');
        const navRepo = new NavigationRepository(db);

        const entryPoints: EntityReference[] = [];

        // Check if any entities are entry points
        for (const entity of entities) {
            if (entity.dimension === 'X') {
                const metadata = await navRepo.getByEntity('X', entity.entityId, pluginId);
                if (metadata && metadata.is_entry_point) {
                    entryPoints.push(entity.entityRef);
                }
            } else if (entity.dimension === 'W') {
                // ADRs are often entry points
                entryPoints.push(entity.entityRef);
            }
        }

        // If no entry points found, use first ADR or first module
        if (entryPoints.length === 0) {
            const firstAdr = entities.find(e => e.dimension === 'W');
            if (firstAdr) {
                entryPoints.push(firstAdr.entityRef);
            } else {
                const firstModule = entities.find(e => e.dimension === 'X');
                if (firstModule) {
                    entryPoints.push(firstModule.entityRef);
                }
            }
        }

        return entryPoints;
    }

    /**
     * Builds dependency path from entry points to targets.
     */
    private async buildDependencyPath(
        entryPoints: EntityReference[],
        targets: SemanticSearchResult[],
        pluginId: string
    ): Promise<LearningPathStep[]> {
        const path: LearningPathStep[] = [];
        const visited = new Set<string>();

        // Get all dependencies
        const allDependencies = await this.dependencyApi.getAllDependencies(pluginId);

        // Build dependency graph
        const dependencyGraph = new Map<string, Set<string>>();  // module -> [dependencies]
        for (const dep of allDependencies) {
            if (!dependencyGraph.has(dep.from_module)) {
                dependencyGraph.set(dep.from_module, new Set());
            }
            dependencyGraph.get(dep.from_module)!.add(dep.to_module);
        }

        // Step 1: Start with entry points (ADRs first, then modules)
        const adrEntryPoints = entryPoints.filter(ep => ep.dimension === 'W');
        const moduleEntryPoints = entryPoints.filter(ep => ep.dimension === 'X');

        let stepNumber = 1;

        // Add ADR entry points
        for (const entryPoint of adrEntryPoints) {
            if (!visited.has(entryPoint.entity_id)) {
                const adr = await this.adrApi.getAdrByNumber(entryPoint.external_id, pluginId);
                if (adr) {
                    path.push({
                        step: stepNumber++,
                        entity: entryPoint,
                        action: 'read',
                        reason: `Architecture overview: ${adr.title}`
                    });
                    visited.add(entryPoint.entity_id);
                }
            }
        }

        // Add module entry points
        for (const entryPoint of moduleEntryPoints) {
            if (!visited.has(entryPoint.entity_id)) {
                const module = await this.moduleApi.getModuleById(entryPoint.entity_id, pluginId);
                if (module) {
                    path.push({
                        step: stepNumber++,
                        entity: entryPoint,
                        action: 'study',
                        reason: `Core module: ${module.file_path}`
                    });
                    visited.add(entryPoint.entity_id);
                }
            }
        }

        // Step 2: Add target entities (sorted by relevance)
        const sortedTargets = targets.sort((a, b) => b.score - a.score);

        for (const target of sortedTargets) {
            if (!visited.has(target.entityId)) {
                let action: 'read' | 'study' | 'examine' | 'understand' = 'examine';
                let reason = 'Relevant to topic';

                if (target.dimension === 'W') {
                    action = 'read';
                    const adr = await this.adrApi.getAdrByNumber(target.externalId, pluginId);
                    if (adr) {
                        reason = `ADR: ${adr.title}`;
                    }
                } else if (target.dimension === 'X') {
                    action = 'study';
                    const module = await this.moduleApi.getModuleById(target.entityId, pluginId);
                    if (module) {
                        reason = `Module: ${module.file_path}`;
                    }
                } else if (target.dimension === 'Y') {
                    action = 'examine';
                    reason = `Symbol: ${target.externalId}`;
                }

                path.push({
                    step: stepNumber++,
                    entity: target.entityRef,
                    action,
                    reason
                });
                visited.add(target.entityId);
            }
        }

        return path;
    }
}

