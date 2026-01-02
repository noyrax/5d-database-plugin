import { NoyraxIntegrationService } from './noyrax-integration-service';
import { IngestionOrchestrator } from './ingestion-orchestrator';
import { MultiDbManager } from '../core/multi-db-manager';
import { DocsPathResolver } from '../core/docs-path-resolver';

/**
 * Options for running the full workflow.
 */
export interface WorkflowOptions {
    /**
     * Whether to generate documentation first (default: true).
     */
    generateDocs?: boolean;

    /**
     * Whether to perform full ingestion (default: false, uses incremental).
     */
    fullIngestion?: boolean;

    /**
     * Whether to generate embeddings (default: true).
     */
    generateEmbeddings?: boolean;

    /**
     * Whether to skip if docs are already up-to-date (default: false).
     */
    skipIfUpToDate?: boolean;
}

/**
 * Result of running the workflow.
 */
export interface WorkflowResult {
    success: boolean;
    docsGenerated: boolean;
    ingestionCompleted: boolean;
    embeddingsGenerated: boolean;
    errors?: string[];
    warnings?: string[];
}

/**
 * Orchestrates the complete workflow:
 * 1. Noyrax: Generate documentation (scan → validate → generate)
 * 2. 5D Database: Ingest documentation into SQLite databases
 * 3. V-Dimension: Generate embeddings and calculate importance scores
 */
export class WorkflowOrchestrator {
    private noyraxService: NoyraxIntegrationService;
    private ingestionOrchestrator: IngestionOrchestrator;
    private dbManager: MultiDbManager;
    private workspaceRoot: string;

    constructor(
        workspaceRoot: string,
        dbManager: MultiDbManager,
        ingestionOrchestrator: IngestionOrchestrator
    ) {
        this.workspaceRoot = workspaceRoot;
        this.dbManager = dbManager;
        this.ingestionOrchestrator = ingestionOrchestrator;
        this.noyraxService = new NoyraxIntegrationService(workspaceRoot);
    }

    /**
     * Runs the full workflow.
     * 
     * @param options Workflow options
     * @returns Promise that resolves with the workflow result
     */
    async runFullWorkflow(options: WorkflowOptions = {}): Promise<WorkflowResult> {
        const {
            generateDocs = true,
            fullIngestion = false,
            generateEmbeddings = true,
            skipIfUpToDate = false
        } = options;

        const result: WorkflowResult = {
            success: false,
            docsGenerated: false,
            ingestionCompleted: false,
            embeddingsGenerated: false,
            errors: [],
            warnings: []
        };

        try {
            // Step 1: Generate documentation (if requested)
            if (generateDocs) {
                // Check if docs need regeneration
                if (skipIfUpToDate) {
                    const needsRegen = await this.noyraxService.needsRegeneration();
                    if (!needsRegen) {
                        console.log('[WorkflowOrchestrator] Documentation is up-to-date, skipping generation.');
                        result.docsGenerated = false; // Not generated, but exists
                    } else {
                        console.log('[WorkflowOrchestrator] Documentation needs regeneration, generating...');
                        await this.noyraxService.generateDocumentation();
                        result.docsGenerated = true;
                    }
                } else {
                    console.log('[WorkflowOrchestrator] Generating documentation...');
                    await this.noyraxService.generateDocumentation();
                    result.docsGenerated = true;
                }
            }

            // Step 2: Find docs path
            const docsPath = DocsPathResolver.findDocsDirectoryFromPath(this.workspaceRoot);
            if (!docsPath) {
                throw new Error(
                    'docs/ directory not found. ' +
                    'Please ensure documentation has been generated or specify the docs path.'
                );
            }

            // Step 3: Get plugin ID
            const pluginId = this.dbManager.getPluginId();

            // Step 4: Perform ingestion
            console.log('[WorkflowOrchestrator] Starting ingestion...');
            if (fullIngestion) {
                await this.ingestionOrchestrator.ingestFull(this.workspaceRoot, pluginId, docsPath);
            } else {
                await this.ingestionOrchestrator.ingestIncremental(this.workspaceRoot, pluginId, docsPath);
            }
            result.ingestionCompleted = true;

            // Step 5: Generate embeddings (if requested)
            // Note: Embeddings are already generated during ingestion (V-Dimension),
            // but we can verify they exist
            if (generateEmbeddings) {
                // Embeddings are handled by IngestionOrchestrator during ingestion
                // This is just a flag to indicate they should be generated
                result.embeddingsGenerated = true;
            }

            result.success = true;
            console.log('[WorkflowOrchestrator] Full workflow completed successfully.');

        } catch (error: any) {
            const errorMessage = error.message || String(error);
            result.errors = result.errors || [];
            result.errors.push(errorMessage);
            result.success = false;
            console.error('[WorkflowOrchestrator] Workflow failed:', errorMessage);
            throw error;
        }

        return result;
    }

    /**
     * Checks the status of the workflow prerequisites.
     */
    async checkStatus(): Promise<{
        noyraxAvailable: boolean;
        docsStatus: import('./noyrax-integration-service').DocsStatus;
        dbManagerReady: boolean;
    }> {
        // Check if Noyrax is available by checking docs status
        const docsStatus = await this.noyraxService.checkDocsStatus();
        const noyraxAvailable = docsStatus.exists || docsStatus.hasModules;
        const dbManagerReady = this.dbManager !== undefined;

        return {
            noyraxAvailable,
            docsStatus,
            dbManagerReady
        };
    }
}

