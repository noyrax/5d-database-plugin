import { MultiDbManager } from '../core/multi-db-manager';
import { NavigationRepository } from '../repositories/navigation-repository';
import { EmbeddingRepository } from '../repositories/embedding-repository';
import { AdrApi } from './adr-api';
import { ModuleApi } from './module-api';
import { SymbolApi } from './symbol-api';
import { DependencyApi } from './dependency-api';
import { ChangeApi } from './change-api';
import { EntityReference } from '../models/entity-reference';
import { Evidence } from '../models/evidence';
import { EvidenceGrader } from './evidence-grader';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Module } from '../models/module';

/**
 * System explanation interface.
 * Describes what the system is, how it works, and entry points.
 */
export interface SystemExplanation {
    what_am_i: string;
    how_do_i_work: string;
    dimensions: Array<{
        id: 'X' | 'Y' | 'Z' | 'W' | 'T' | 'V';
        name: string;
        description: string;
        entity_count?: number;
    }>;
    entry_points: Array<EntityReference & { reason?: string }>;
    architecture_adrs: Array<{ adr_number: string; title: string }>;
    suggested_start: string;
    evidence?: Evidence;
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
    evidence?: Evidence;
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
    private evidenceGrader: EvidenceGrader;

    constructor(dbManager: MultiDbManager) {
        this.dbManager = dbManager;
        this.adrApi = new AdrApi(dbManager);
        this.moduleApi = new ModuleApi(dbManager);
        this.symbolApi = new SymbolApi(dbManager);
        this.dependencyApi = new DependencyApi(dbManager);
        this.changeApi = new ChangeApi(dbManager);
        this.evidenceGrader = new EvidenceGrader();
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

        // Create evidence: INFERRED from multiple DB queries
        const evidence = this.evidenceGrader.gradeAsInferred(
            [
                {
                    type: 'DB_QUERY',
                    path: 'getAllModules'
                },
                {
                    type: 'DB_QUERY',
                    path: 'getAllSymbols'
                },
                {
                    type: 'DB_QUERY',
                    path: 'getAllDependencies'
                },
                {
                    type: 'DB_QUERY',
                    path: 'getAllAdrs'
                },
                {
                    type: 'DB_QUERY',
                    path: 'getAllChangeReports'
                }
            ],
            'System overview derived from multiple database queries across all dimensions'
        );

        return {
            total_modules: modules.length,
            total_symbols: symbols.length,
            total_dependencies: dependencies.length,
            total_adrs: adrs.length,
            total_change_reports: changeReports.length,
            entry_points: entryPoints,
            architecture_adrs: architectureAdrs,
            evidence
        };
    }

    /**
     * Explains the system: what it is, how it works, entry points, and architecture ADRs.
     * REQUIRED: Must NOT throw if DB files/tables are missing. If DB queries fail, treat as Mode A (No Data).
     */
    async explainSystem(pluginId: string): Promise<SystemExplanation> {
        const workspaceRoot = this.dbManager.getWorkspaceRoot();
        
        // DB-Robustheit: Wrap all DB queries in try/catch
        let modules: Module[] = [];
        let symbols: any[] = [];
        let dependencies: any[] = [];
        let adrs: any[] = [];
        let changeReports: any[] = [];
        let entryPoints: Array<EntityReference & { reason?: string }> = [];
        let architectureAdrs: Array<{ adr_number: string; title: string }> = [];
        let embeddings: any[] = [];
        let dbReady = true;
        
        try {
            // Try to load all data
            entryPoints = await this.getEntryPoints(pluginId);
            architectureAdrs = await this.getArchitectureAdrs(pluginId);
            modules = await this.moduleApi.getAllModules(pluginId);
            symbols = await this.symbolApi.getAllSymbols(pluginId);
            dependencies = await this.dependencyApi.getAllDependencies(pluginId);
            adrs = await this.adrApi.getAllAdrs(pluginId);
            changeReports = await this.changeApi.getAllChangeReports(pluginId);
            
            // Get V-Dimension (embeddings) count
            const db = await this.dbManager.getDatabase('V');
            const embeddingRepo = new EmbeddingRepository(db);
            embeddings = await embeddingRepo.getAll(pluginId);
        } catch (error) {
            // DB error => treat as Mode A (No Data)
            dbReady = false;
            // Arrays already initialized to []
        }
        
        // Prüfung: Sind Daten vorhanden?
        const hasData = dbReady && (modules.length > 0 || symbols.length > 0 || adrs.length > 0);
        
        // System identifizieren (mit Daten für Fallbacks, aber auch ohne Daten möglich)
        const systemInfo = await this.identifySystem(
            workspaceRoot, 
            hasData ? modules : [], 
            hasData ? entryPoints : [], 
            hasData ? architectureAdrs : []
        );
        
        // Self-Analysis-Detection: Prüfe ob System = "5D Database Plugin"
        const isSelfAnalysis = systemInfo.name === '5D Database Plugin' || 
                              systemInfo.name === '@noyrax/5d-database-plugin' ||
                              systemInfo.name === 'noyrax-workspace';
        
        // Dynamische Beschreibungen generieren
        const whatAmI = `${systemInfo.name} - ${systemInfo.description}`;
        
        let howDoIWork: string;  // NUR System facts, NICHT Mechanismus
        let suggestedStart: string;
        
        if (hasData) {
            // Mode B: Has Data - System facts (was ist in der Codebase)
            howDoIWork = `This codebase contains ${modules.length} modules, ${symbols.length} symbols, ${dependencies.length} dependencies, ${adrs.length} ADRs, ${changeReports.length} change reports, and ${embeddings.length} embeddings.`;
            
            // Zusätzliche Info basierend auf Entry Points oder ADRs
            if (architectureAdrs.length > 0) {
                howDoIWork += ` It has ${architectureAdrs.length} architecture decision records documenting key design choices.`;
            }
            if (entryPoints.length > 0) {
                howDoIWork += ` Key entry points include ${entryPoints.slice(0, 3).map(ep => ep.external_id).join(', ')}.`;
            }
            
            // suggestedStart mit Priorisierung (Self-Analysis: MultiDbManager Fallback)
            if (isSelfAnalysis && modules.some(m => m.file_path.includes('multi-db-manager'))) {
                suggestedStart = 'Start with MultiDbManager (core module)';
            } else if (entryPoints.length > 0) {
                suggestedStart = `Start with ${entryPoints[0].external_id} (${entryPoints[0].reason})`;
            } else if (architectureAdrs.length > 0) {
                suggestedStart = `Start with ${architectureAdrs[0].adr_number} (${architectureAdrs[0].title})`;
            } else {
                suggestedStart = 'Start exploring the codebase using semantic_discovery';
            }
        } else {
            // Mode A: No Data (First Run) - System facts (nichts vorhanden)
            howDoIWork = `This system has not been analyzed yet. No modules, symbols, or ADRs are available.`;
            suggestedStart = 'Start by initializing the system: Use workflow_ensure_ready (automatic) or workflow_full_cycle (complete workflow)';
        }
        
        // Evidence basierend auf Source (FACT vs. INFERRED) mit sourcePath
        let identificationEvidence: Evidence;
        if (systemInfo.evidenceGrade === 'FACT' && systemInfo.sourcePath) {
            // Für FACT-Quellen: Verwende FILESYSTEM_READ mit tatsächlichem sourcePath
            identificationEvidence = this.evidenceGrader.gradeAsFact(
                [{
                    type: 'FILESYSTEM_READ',
                    path: systemInfo.sourcePath
                }],
                `System identification from ${systemInfo.source}`
            );
        } else {
            // Für INFERRED-Quellen: HEURISTIC type
            identificationEvidence = this.evidenceGrader.gradeAsInferred(
                [{
                    type: 'HEURISTIC',
                    path: 'system_identification'
                }],
                `System identification inferred from ${systemInfo.source}`
            );
        }
        
        // Kombiniere Evidence (System-Identifikation + DB-Queries nur wenn dbReady)
        const evidenceSources = [...identificationEvidence.sources];
        if (dbReady) {
            evidenceSources.push(
                { type: 'DB_QUERY', path: 'getAllModules' },
                { type: 'DB_QUERY', path: 'getAllSymbols' },
                { type: 'DB_QUERY', path: 'getAllDependencies' },
                { type: 'DB_QUERY', path: 'getAllAdrs' },
                { type: 'DB_QUERY', path: 'getAllChangeReports' },
                { type: 'DB_QUERY', path: 'getEntryPoints' },
                { type: 'DB_QUERY', path: 'getArchitectureAdrs' }
            );
        }
        
        const combinedEvidence = this.evidenceGrader.gradeAsInferred(
            evidenceSources,
            'System explanation combines filesystem reads and database queries'
        );

        return {
            what_am_i: whatAmI,  // Die Codebase (Name/Desc)
            how_do_i_work: howDoIWork,  // System facts (was ist in der Codebase), NICHT Mechanismus
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
                },
                {
                    id: 'V',
                    name: 'Embeddings',
                    description: 'Vector embeddings for semantic search',
                    entity_count: embeddings.length
                }
            ],
            entry_points: entryPoints,
            architecture_adrs: architectureAdrs,
            suggested_start: suggestedStart,
            evidence: combinedEvidence
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

    /**
     * Identifies the system by reading package.json, README.md, or inferring from data.
     * Returns system name, description, source, evidence grade, and source path (for FACT sources).
     */
    private async identifySystem(
        workspaceRoot: string,
        modules: Module[],
        entryPoints: EntityReference[],
        architectureAdrs: Array<{adr_number: string, title: string}>
    ): Promise<{
        name: string, 
        description: string,
        source: 'package.json' | 'readme' | 'data' | 'fallback',
        evidenceGrade: 'FACT' | 'INFERRED',
        sourcePath?: string
    }> {
        // 1. Primär: Versuche package.json zu lesen
        const packageJsonPath = path.join(workspaceRoot, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            try {
                const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
                // displayName ist nur in VS Code Extensions vorhanden, nicht in Standard npm-Paketen
                const name = packageJson.displayName || packageJson.name;
                const description = packageJson.description;
                
                if (name && description) {
                    return { 
                        name, 
                        description,
                        source: 'package.json',
                        evidenceGrade: 'FACT',
                        sourcePath: packageJsonPath
                    };
                }
                if (name) {
                    return { 
                        name, 
                        description: description || 'No description available',
                        source: 'package.json',
                        evidenceGrade: 'FACT',
                        sourcePath: packageJsonPath
                    };
                }
            } catch {
                // JSON parse error oder Zugriffsfehler → weiter zu Fallback
            }
        }
        
        // 2. Fallback 1: Versuche README.md zu lesen (mit Encoding-Robustheit)
        const readmePath = path.join(workspaceRoot, 'README.md');
        if (fs.existsSync(readmePath)) {
            try {
                const stats = fs.statSync(readmePath);
                // README zu groß (> 10 MB), skip
                if (stats.size > 10 * 1024 * 1024) {
                    // Weiter zu Fallback
                } else {
                    const readmeContent = fs.readFileSync(readmePath, { encoding: 'utf8', flag: 'r' });
                    const lines = readmeContent.split('\n');
                    
                    // Suche H1-Titel (erste Zeile mit # am Anfang, max. 20 Zeilen prüfen)
                    for (let i = 0; i < Math.min(lines.length, 20); i++) {
                        const line = lines[i].trim();
                        if (line.startsWith('# ')) {
                            const name = line.substring(2).trim();
                            
                            // Nächste nicht-leere Zeile als Beschreibung (max. 10 Zeilen nach Titel)
                            let description = '';
                            for (let j = i + 1; j < Math.min(lines.length, i + 10); j++) {
                                const nextLine = lines[j].trim();
                                if (nextLine && !nextLine.startsWith('#')) {
                                    description = nextLine;
                                    break;
                                }
                            }
                            
                            if (name) {
                                return { 
                                    name, 
                                    description: description || 'No description available',
                                    source: 'readme',
                                    evidenceGrade: 'FACT',
                                    sourcePath: readmePath
                                };
                            }
                        }
                    }
                }
            } catch {
                // Encoding-Fehler oder Zugriffsfehler → weiter zu Fallback
            }
        }
        
        // 3. Fallback 2: Basierend auf Daten (Entry Points oder ADRs)
        if (entryPoints.length > 0) {
            // Extrahiere häufigsten Pfad-Präfix aus Entry Points
            const pathPrefixes = entryPoints
                .map(ep => {
                    const parts = ep.external_id.split('/');
                    return parts.length > 1 ? parts[0] : null;
                })
                .filter(p => p !== null) as string[];
            
            if (pathPrefixes.length > 0) {
                // Zähle Häufigkeit
                const prefixCounts = new Map<string, number>();
                pathPrefixes.forEach(p => {
                    prefixCounts.set(p, (prefixCounts.get(p) || 0) + 1);
                });
                
                // Wähle häufigsten Präfix
                const mostCommonPrefix = Array.from(prefixCounts.entries())
                    .sort((a, b) => b[1] - a[1])[0][0];
                
                const name = mostCommonPrefix || 'Codebase';
                const description = architectureAdrs.length > 0
                    ? `System with ${modules.length} modules and ${architectureAdrs.length} architecture ADRs`
                    : `System with ${modules.length} modules`;
                
                return { 
                    name, 
                    description,
                    source: 'data',
                    evidenceGrade: 'INFERRED',
                    sourcePath: undefined
                };
            }
        }
        
        // 4. Fallback 3: Generische Beschreibung
        return {
            name: 'Codebase',
            description: `A codebase with ${modules.length} modules analyzed by the 5D Database Plugin`,
            source: 'fallback',
            evidenceGrade: 'INFERRED',
            sourcePath: undefined
        };
    }
}


