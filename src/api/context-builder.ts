import { MultiDbManager } from '../core/multi-db-manager';
import { IdMapper } from '../core/id-mapper';
import { CrossDimensionApi } from './cross-dimension-api';
import { ModuleApi } from './module-api';
import { SymbolApi } from './symbol-api';
import { DependencyApi } from './dependency-api';
import { AdrApi } from './adr-api';
import { ChangeApi } from './change-api';
import { NavigationRepository } from '../repositories/navigation-repository';
import { EntityReference } from '../models/entity-reference';
import { Module } from '../models/module';
import { Symbol } from '../models/symbol';
import { Dependency } from '../models/dependency';
import { Adr } from '../models/adr';
import { ChangeReport } from '../models/change';

/**
 * Structured context for an entity or set of entities.
 * Contains all relevant information from 5D-DBs WITHOUT AI generation.
 */
export interface StructuredContext {
    entities: Array<{
        dimension: 'X' | 'Y' | 'Z' | 'W' | 'T';
        entityId: string;
        externalId: string;
        details: any;  // Full entity data from corresponding dimension
    }>;
    related: Array<{
        entityRef: EntityReference;
        relationship: string;  // e.g., "contains", "depends_on", "references"
    }>;
    adrs: Array<{
        adr_number: string;
        title: string;
        content_preview: string;  // First 500 chars
    }>;
    dependencies: Array<{
        from: string;
        to: string;
        type: string;
    }>;
    entryPoints: Array<EntityReference>;
}

/**
 * Builds structured, deterministic context from 5D-DBs.
 * NO AI generation - only data from databases.
 */
export class ContextBuilder {
    private dbManager: MultiDbManager;
    private crossDimensionApi: CrossDimensionApi;
    private moduleApi: ModuleApi;
    private symbolApi: SymbolApi;
    private dependencyApi: DependencyApi;
    private adrApi: AdrApi;
    private changeApi: ChangeApi;

    constructor(dbManager: MultiDbManager, idMapper: IdMapper) {
        this.dbManager = dbManager;
        this.crossDimensionApi = new CrossDimensionApi(dbManager, idMapper);
        this.moduleApi = new ModuleApi(dbManager);
        this.symbolApi = new SymbolApi(dbManager);
        this.dependencyApi = new DependencyApi(dbManager);
        this.adrApi = new AdrApi(dbManager);
        this.changeApi = new ChangeApi(dbManager);
    }

    /**
     * Builds structured context for a set of entity references.
     * 
     * @param entityRefs Entity references to build context for
     * @param pluginId Plugin ID
     * @returns Promise that resolves to structured context
     */
    async buildContext(
        entityRefs: EntityReference[],
        pluginId: string
    ): Promise<StructuredContext> {
        const entities: StructuredContext['entities'] = [];
        const related: StructuredContext['related'] = [];
        const adrs: StructuredContext['adrs'] = [];
        const dependencies: StructuredContext['dependencies'] = [];
        const entryPoints: StructuredContext['entryPoints'] = [];

        // 1. Get entity details from corresponding dimensions
        for (const entityRef of entityRefs) {
            // Skip V-dimension entities (they're metadata, not content)
            if (entityRef.dimension === 'V') {
                continue;
            }
            const details = await this.getEntityDetails(entityRef, pluginId);
            if (details) {
                entities.push({
                    dimension: entityRef.dimension as 'X' | 'Y' | 'Z' | 'W' | 'T',
                    entityId: entityRef.entity_id,
                    externalId: entityRef.external_id,
                    details
                });

                // 2. Get related entities via CrossDimensionApi
                const relatedEntities = await this.getRelatedEntities(entityRef, pluginId);
                related.push(...relatedEntities);

                // 3. Get relevant ADRs
                const entityAdrs = await this.getRelevantAdrs(entityRef, pluginId);
                adrs.push(...entityAdrs);

                // 4. Get dependencies
                const entityDeps = await this.getDependencies(entityRef, pluginId);
                dependencies.push(...entityDeps);
            }
        }

        // 5. Get entry points
        const entryPointsList = await this.getEntryPoints(pluginId);
        entryPoints.push(...entryPointsList);

        return {
            entities,
            related,
            adrs: this.deduplicateAdrs(adrs),
            dependencies: this.deduplicateDependencies(dependencies),
            entryPoints
        };
    }

    /**
     * Gets entity details from the corresponding dimension.
     */
    private async getEntityDetails(
        entityRef: EntityReference,
        pluginId: string
    ): Promise<any | null> {
        switch (entityRef.dimension) {
            case 'X': {
                const module = await this.moduleApi.getModuleById(entityRef.entity_id, pluginId);
                return module;
            }
            case 'Y': {
                const symbol = await this.symbolApi.getSymbolById(entityRef.external_id, pluginId);
                return symbol;
            }
            case 'Z': {
                const dependency = await this.dependencyApi.getDependencyById(entityRef.entity_id, pluginId);
                return dependency;
            }
            case 'W': {
                const adr = await this.adrApi.getAdrByNumber(entityRef.external_id, pluginId);
                return adr;
            }
            case 'T': {
                const changeReport = await this.changeApi.getChangeReportById(entityRef.entity_id, pluginId);
                return changeReport;
            }
        }
    }

    /**
     * Gets related entities via CrossDimensionApi.
     */
    private async getRelatedEntities(
        entityRef: EntityReference,
        pluginId: string
    ): Promise<Array<{ entityRef: EntityReference; relationship: string }>> {
        const related: Array<{ entityRef: EntityReference; relationship: string }> = [];

        switch (entityRef.dimension) {
            case 'X': {
                // Module → Symbols
                const module = await this.moduleApi.getModuleById(entityRef.entity_id, pluginId);
                if (module) {
                    const symbols = await this.crossDimensionApi.getSymbolsForModule(module.file_path, pluginId);
                    for (const symbolRef of symbols) {
                        related.push({ entityRef: symbolRef, relationship: 'contains' });
                    }
                }
                break;
            }
            case 'Y': {
                // Symbol → Module
                const symbol = await this.symbolApi.getSymbolById(entityRef.external_id, pluginId);
                if (symbol) {
                    const moduleRef = await this.crossDimensionApi.resolveSymbolToModule(entityRef.external_id, pluginId);
                    if (moduleRef) {
                        related.push({ entityRef: moduleRef, relationship: 'belongs_to' });
                    }
                }
                break;
            }
            case 'Z': {
                // Dependency → From/To Modules
                const dependency = await this.dependencyApi.getDependencyById(entityRef.entity_id, pluginId);
                if (dependency) {
                    const fromModule = await this.moduleApi.getModuleByPath(dependency.from_module, pluginId);
                    const toModule = await this.moduleApi.getModuleByPath(dependency.to_module, pluginId);
                    if (fromModule) {
                        related.push({
                            entityRef: {
                                dimension: 'X',
                                entity_id: fromModule.id,
                                external_id: fromModule.file_path
                            },
                            relationship: 'from_module'
                        });
                    }
                    if (toModule) {
                        related.push({
                            entityRef: {
                                dimension: 'X',
                                entity_id: toModule.id,
                                external_id: toModule.file_path
                            },
                            relationship: 'to_module'
                        });
                    }
                }
                break;
            }
            case 'W': {
                // ADR → Referenced Files
                const adr = await this.adrApi.getAdrByNumber(entityRef.external_id, pluginId);
                if (adr) {
                    const fileAdrs = await this.adrApi.getAdrsByFilePath('', pluginId); // Get all for now
                    // Filter by ADR file mappings would be better, but this is a start
                }
                break;
            }
        }

        return related;
    }

    /**
     * Gets relevant ADRs for an entity.
     */
    private async getRelevantAdrs(
        entityRef: EntityReference,
        pluginId: string
    ): Promise<Array<{ adr_number: string; title: string; content_preview: string }>> {
        const adrs: Array<{ adr_number: string; title: string; content_preview: string }> = [];

        // Get navigation metadata for related ADRs
        // Only for X, Y, Z, W, T dimensions (not V)
        if (entityRef.dimension === 'V') {
            return [];
        }
        const db = await this.dbManager.getDatabase('V');
        const navRepo = new NavigationRepository(db);
        const metadata = await navRepo.getByEntity(entityRef.dimension as 'X' | 'Y' | 'Z' | 'W' | 'T', entityRef.entity_id, pluginId);

        if (metadata && metadata.related_adrs) {
            try {
                const adrNumbers = JSON.parse(metadata.related_adrs) as string[];
                for (const adrNumber of adrNumbers) {
                    const adr = await this.adrApi.getAdrByNumber(adrNumber, pluginId);
                    if (adr) {
                        adrs.push({
                            adr_number: adr.adr_number,
                            title: adr.title,
                            content_preview: adr.content_markdown.substring(0, 500)
                        });
                    }
                }
            } catch (error) {
                console.warn(`[ContextBuilder] Failed to parse related ADRs: ${error}`);
            }
        }

        return adrs;
    }

    /**
     * Gets dependencies for an entity.
     */
    private async getDependencies(
        entityRef: EntityReference,
        pluginId: string
    ): Promise<Array<{ from: string; to: string; type: string }>> {
        const dependencies: Array<{ from: string; to: string; type: string }> = [];

        switch (entityRef.dimension) {
            case 'X': {
                // Module dependencies
                const module = await this.moduleApi.getModuleById(entityRef.entity_id, pluginId);
                if (module) {
                    const deps = await this.dependencyApi.getDependenciesByFromModule(module.file_path, pluginId);
                    for (const dep of deps) {
                        dependencies.push({
                            from: dep.from_module,
                            to: dep.to_module,
                            type: dep.dependency_type
                        });
                    }
                }
                break;
            }
            case 'Z': {
                // Dependency itself
                const dependency = await this.dependencyApi.getDependencyById(entityRef.entity_id, pluginId);
                if (dependency) {
                    dependencies.push({
                        from: dependency.from_module,
                        to: dependency.to_module,
                        type: dependency.dependency_type
                    });
                }
                break;
            }
            case 'Y':
            case 'W':
            case 'T':
                // No dependencies for these dimensions
                break;
        }

        return dependencies;
    }

    /**
     * Gets entry points for the system.
     */
    private async getEntryPoints(pluginId: string): Promise<EntityReference[]> {
        const db = await this.dbManager.getDatabase('V');
        const navRepo = new NavigationRepository(db);
        const entryPoints = await navRepo.getEntryPoints('X', pluginId);

        return entryPoints.map(ep => ({
            dimension: ep.dimension as 'X' | 'Y' | 'Z' | 'W' | 'T',
            entity_id: ep.entity_id,
            external_id: '' // Will be resolved from module
        }));
    }

    /**
     * Deduplicates ADRs by adr_number.
     */
    private deduplicateAdrs(
        adrs: Array<{ adr_number: string; title: string; content_preview: string }>
    ): Array<{ adr_number: string; title: string; content_preview: string }> {
        const seen = new Set<string>();
        const unique: Array<{ adr_number: string; title: string; content_preview: string }> = [];

        for (const adr of adrs) {
            if (!seen.has(adr.adr_number)) {
                seen.add(adr.adr_number);
                unique.push(adr);
            }
        }

        return unique;
    }

    /**
     * Deduplicates dependencies by from+to+type.
     */
    private deduplicateDependencies(
        deps: Array<{ from: string; to: string; type: string }>
    ): Array<{ from: string; to: string; type: string }> {
        const seen = new Set<string>();
        const unique: Array<{ from: string; to: string; type: string }> = [];

        for (const dep of deps) {
            const key = `${dep.from}→${dep.to}[${dep.type}]`;
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(dep);
            }
        }

        return unique;
    }
}

