import { MultiDbManager } from '../core/multi-db-manager';
import { MigrationManager } from '../core/migration-manager';
import { BaseIngestor } from '../ingestors/base-ingestor';
import { ModuleIngestor } from '../ingestors/module-ingestor';
import { SymbolIngestor } from '../ingestors/symbol-ingestor';
import { DependencyIngestor } from '../ingestors/dependency-ingestor';
import { AdrIngestor } from '../ingestors/adr-ingestor';
import { ChangeIngestor } from '../ingestors/change-ingestor';
import { Dimension } from '../core/multi-db-manager';
import { EmbeddingPipeline } from '../embedding/embedding-pipeline';
import { EmbeddingGenerator } from '../embedding/embedding-generator';
import { ImportanceScorer } from '../services/importance-scorer';
import { NavigationBuilder } from '../services/navigation-builder';

/**
 * Orchestrates ingestion across all 5 dimensions.
 * Coordinates the ingestion process and ensures consistency.
 */
export class IngestionOrchestrator {
    private dbManager: MultiDbManager;
    private migrationManager: MigrationManager;
    private ingestors: Map<Dimension, BaseIngestor>;
    private docsPath?: string;
    private embeddingPipeline?: EmbeddingPipeline;
    private importanceScorer?: ImportanceScorer;
    private navigationBuilder?: NavigationBuilder;

    constructor(dbManager: MultiDbManager, migrationManager: MigrationManager, docsPath?: string) {
        this.dbManager = dbManager;
        this.migrationManager = migrationManager;
        this.docsPath = docsPath;
        
        this.ingestors = new Map<Dimension, BaseIngestor>();
        this.ingestors.set('X', new ModuleIngestor(dbManager));
        this.ingestors.set('Y', new SymbolIngestor(dbManager));
        this.ingestors.set('Z', new DependencyIngestor(dbManager));
        this.ingestors.set('W', new AdrIngestor(dbManager));
        this.ingestors.set('T', new ChangeIngestor(dbManager));

        // Initialize V-Dimension services (lazy initialization)
        const embeddingGenerator = new EmbeddingGenerator();
        this.embeddingPipeline = new EmbeddingPipeline(dbManager, embeddingGenerator);
        this.importanceScorer = new ImportanceScorer(dbManager);
        this.navigationBuilder = new NavigationBuilder(dbManager);
    }

    /**
     * Performs a full ingestion of all dimensions.
     * After 5D ingestion, triggers V-Dimension processing (embeddings, importance scores, navigation).
     * 
     * @param workspaceRoot The workspace root directory
     * @param pluginId The plugin ID
     * @param docsPath The path to the docs directory (optional, uses constructor value if not provided)
     * @returns Promise that resolves when ingestion is complete
     */
    public async ingestFull(workspaceRoot: string, pluginId: string, docsPath?: string): Promise<void> {
        await this.migrationManager.migrateAll();

        const effectiveDocsPath = docsPath || this.docsPath;
        if (!effectiveDocsPath) {
            throw new Error('docs/ directory not found. Cannot perform ingestion.');
        }

        // 1. Ingest 5D dimensions
        const dimensions: Dimension[] = ['X', 'Y', 'Z', 'W', 'T'];
        
        for (const dimension of dimensions) {
            const ingestor = this.ingestors.get(dimension);
            if (ingestor) {
                await ingestor.ingestFull(workspaceRoot, pluginId, effectiveDocsPath);
            }
        }

        // 2. V-Dimension: Semantic Brain
        // Ensure V-dimension migration is applied
        await this.migrationManager.migrate('V');

        // Sync embeddings
        if (this.embeddingPipeline) {
            await this.embeddingPipeline.syncEmbeddings(pluginId);
        }

        // Calculate importance scores (after dependencies are ingested)
        if (this.importanceScorer) {
            await this.importanceScorer.calculateCombinedScores(pluginId);
        }

        // Build navigation metadata
        if (this.navigationBuilder) {
            await this.navigationBuilder.buildMetadata(pluginId);
        }
    }

    /**
     * Performs an incremental ingestion of all dimensions.
     * After 5D ingestion, triggers V-Dimension processing (embeddings, importance scores, navigation).
     * 
     * @param workspaceRoot The workspace root directory
     * @param pluginId The plugin ID
     * @param docsPath The path to the docs directory (optional, uses constructor value if not provided)
     * @returns Promise that resolves when ingestion is complete
     */
    public async ingestIncremental(workspaceRoot: string, pluginId: string, docsPath?: string): Promise<void> {
        await this.migrationManager.migrateAll();

        const effectiveDocsPath = docsPath || this.docsPath;
        if (!effectiveDocsPath) {
            throw new Error('docs/ directory not found. Cannot perform ingestion.');
        }

        // 1. Ingest 5D dimensions
        const dimensions: Dimension[] = ['X', 'Y', 'Z', 'W', 'T'];
        
        for (const dimension of dimensions) {
            const ingestor = this.ingestors.get(dimension);
            if (ingestor) {
                await ingestor.ingestIncremental(workspaceRoot, pluginId, effectiveDocsPath);
            }
        }

        // 2. V-Dimension: Semantic Brain
        // Ensure V-dimension migration is applied
        await this.migrationManager.migrate('V');

        // Sync embeddings
        if (this.embeddingPipeline) {
            await this.embeddingPipeline.syncEmbeddings(pluginId);
        }

        // Calculate importance scores (after dependencies are ingested)
        if (this.importanceScorer) {
            await this.importanceScorer.calculateCombinedScores(pluginId);
        }

        // Build navigation metadata
        if (this.navigationBuilder) {
            await this.navigationBuilder.buildMetadata(pluginId);
        }
    }

    /**
     * Ingests a specific dimension.
     * 
     * @param dimension The dimension to ingest
     * @param workspaceRoot The workspace root directory
     * @param pluginId The plugin ID
     * @param docsPath The path to the docs directory (optional, uses constructor value if not provided)
     * @param incremental Whether to perform incremental ingestion
     * @returns Promise that resolves when ingestion is complete
     */
    public async ingestDimension(
        dimension: Dimension,
        workspaceRoot: string,
        pluginId: string,
        docsPath?: string,
        incremental: boolean = false
    ): Promise<void> {
        await this.migrationManager.migrate(dimension);

        const effectiveDocsPath = docsPath || this.docsPath;
        if (!effectiveDocsPath) {
            throw new Error('docs/ directory not found. Cannot perform ingestion.');
        }

        const ingestor = this.ingestors.get(dimension);
        if (ingestor) {
            if (incremental) {
                await ingestor.ingestIncremental(workspaceRoot, pluginId, effectiveDocsPath);
            } else {
                await ingestor.ingestFull(workspaceRoot, pluginId, effectiveDocsPath);
            }
        }
    }
}

