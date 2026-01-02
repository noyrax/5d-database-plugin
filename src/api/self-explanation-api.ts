import { MultiDbManager } from '../core/multi-db-manager';
import { NavigationRepository } from '../repositories/navigation-repository';
import { AdrApi } from './adr-api';
import { ModuleApi } from './module-api';
import { SymbolApi } from './symbol-api';
import { DependencyApi } from './dependency-api';
import { ChangeApi } from './change-api';
import { EntityReference } from '../models/entity-reference';

/**
 * System explanation interface.
 * Describes what the system is, how it works, and entry points.
 */
export interface SystemExplanation {
    what_am_i: string;
    how_do_i_work: string;
    dimensions: Array<{
        id: 'X' | 'Y' | 'Z' | 'W' | 'T';
        name: string;
        description: string;
        entity_count?: number;
    }>;
    entry_points: Array<EntityReference & { reason?: string }>;
    architecture_adrs: Array<{ adr_number: string; title: string }>;
    suggested_start: string;
}

/**
 * System overview interface.
 */
export interface SystemOverview {
    total_modules: number;
    total_symbols: number;
    total_dependencies: number;
    total_adrs: number;
    total_change_reports: number;
    entry_points: Array<EntityReference & { reason?: string }>;
    architecture_adrs: Array<{ adr_number: string; title: string }>;
}

/**
 * API for system self-explanation.
 * Provides meta-information about the system WITHOUT AI generation.
 */
export class SelfExplanationApi {
    private dbManager: MultiDbManager;
    private adrApi: AdrApi;
    private moduleApi: ModuleApi;
    private symbolApi: SymbolApi;
    private dependencyApi: DependencyApi;
    private changeApi: ChangeApi;

    constructor(dbManager: MultiDbManager) {
        this.dbManager = dbManager;
        this.adrApi = new AdrApi(dbManager);
        this.moduleApi = new ModuleApi(dbManager);
        this.symbolApi = new SymbolApi(dbManager);
        this.dependencyApi = new DependencyApi(dbManager);
        this.changeApi = new ChangeApi(dbManager);
    }

    /**
     * Gets system overview with statistics and entry points.
     */
    async getSystemOverview(pluginId: string): Promise<SystemOverview> {
        // Get statistics
        const modules = await this.moduleApi.getAllModules(pluginId);
        const symbols = await this.symbolApi.getAllSymbols(pluginId);
        const dependencies = await this.dependencyApi.getAllDependencies(pluginId);
        const adrs = await this.adrApi.getAllAdrs(pluginId);
        const changeReports = await this.changeApi.getAllChangeReports(pluginId);

        // Get entry points
        const entryPoints = await this.getEntryPoints(pluginId);

        // Get architecture ADRs
        const architectureAdrs = await this.getArchitectureAdrs(pluginId);

        return {
            total_modules: modules.length,
            total_symbols: symbols.length,
            total_dependencies: dependencies.length,
            total_adrs: adrs.length,
            total_change_reports: changeReports.length,
            entry_points: entryPoints,
            architecture_adrs: architectureAdrs
        };
    }

    /**
     * Explains the system: what it is, how it works, entry points, and architecture ADRs.
     */
    async explainSystem(pluginId: string): Promise<SystemExplanation> {
        // Get entry points
        const entryPoints = await this.getEntryPoints(pluginId);

        // Get architecture ADRs
        const architectureAdrs = await this.getArchitectureAdrs(pluginId);

        // Get dimension statistics
        const modules = await this.moduleApi.getAllModules(pluginId);
        const symbols = await this.symbolApi.getAllSymbols(pluginId);
        const dependencies = await this.dependencyApi.getAllDependencies(pluginId);
        const adrs = await this.adrApi.getAllAdrs(pluginId);
        const changeReports = await this.changeApi.getAllChangeReports(pluginId);

        // Determine suggested start
        let suggestedStart = 'Start with MultiDbManager (core module)';
        if (architectureAdrs.length > 0) {
            const firstAdr = architectureAdrs[0];
            suggestedStart = `Start with ${firstAdr.adr_number} (${firstAdr.title})`;
        }

        return {
            what_am_i: '5D Database Plugin - navigable code documentation system',
            how_do_i_work: '5 dimensions (X,Y,Z,W,T) store different views of code: Modules (X), Symbols (Y), Dependencies (Z), ADRs (W), and Changes (T). Each dimension provides a different perspective on the codebase, enabling cross-dimensional navigation and analysis.',
            dimensions: [
                {
                    id: 'X',
                    name: 'Modules',
                    description: 'API documentation per file',
                    entity_count: modules.length
                },
                {
                    id: 'Y',
                    name: 'Symbols',
                    description: 'Symbols with dependencies',
                    entity_count: symbols.length
                },
                {
                    id: 'Z',
                    name: 'Dependencies',
                    description: 'Module dependencies',
                    entity_count: dependencies.length
                },
                {
                    id: 'W',
                    name: 'ADRs',
                    description: 'Architecture decisions',
                    entity_count: adrs.length
                },
                {
                    id: 'T',
                    name: 'Changes',
                    description: 'Change history',
                    entity_count: changeReports.length
                }
            ],
            entry_points: entryPoints,
            architecture_adrs: architectureAdrs,
            suggested_start: suggestedStart
        };
    }

    /**
     * Gets entry points for the system.
     */
    private async getEntryPoints(pluginId: string): Promise<Array<EntityReference & { reason?: string }>> {
        const db = await this.dbManager.getDatabase('V');
        const navRepo = new NavigationRepository(db);
        const entryPoints = await navRepo.getEntryPoints('X', pluginId);

        const result: Array<EntityReference & { reason?: string }> = [];

        for (const ep of entryPoints) {
            const module = await this.moduleApi.getModuleById(ep.entity_id, pluginId);
            if (module) {
                result.push({
                    dimension: 'X',
                    entity_id: ep.entity_id,
                    external_id: module.file_path,
                    reason: ep.importance_rank ? `Entry point (rank ${ep.importance_rank})` : 'Entry point'
                });
            }
        }

        return result;
    }

    /**
     * Gets architecture ADRs (typically ADR-001, ADR-002, etc.).
     */
    private async getArchitectureAdrs(pluginId: string): Promise<Array<{ adr_number: string; title: string }>> {
        const allAdrs = await this.adrApi.getAllAdrs(pluginId);

        // Filter for architecture ADRs (typically low-numbered ADRs)
        // ADRs with numbers like "001", "002", "003" are usually architecture ADRs
        const architectureAdrs = allAdrs
            .filter(adr => {
                const num = parseInt(adr.adr_number);
                return !isNaN(num) && num <= 10; // First 10 ADRs are usually architecture
            })
            .sort((a, b) => {
                const numA = parseInt(a.adr_number);
                const numB = parseInt(b.adr_number);
                return numA - numB;
            })
            .map(adr => ({
                adr_number: adr.adr_number,
                title: adr.title
            }));

        return architectureAdrs;
    }
}


