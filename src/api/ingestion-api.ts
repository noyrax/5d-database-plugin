import { MultiDbManager } from '../core/multi-db-manager';
import { MigrationManager } from '../core/migration-manager';
import { IngestionOrchestrator } from '../services/ingestion-orchestrator';
import { DocsPathResolver } from '../core/docs-path-resolver';
import * as path from 'path';
import * as fs from 'fs';

/**
 * API for ingestion operations.
 * Provides programmatic access to ingestion functionality.
 */
export class IngestionApi {
    private dbManager: MultiDbManager;
    private migrationManager: MigrationManager;
    private ingestionOrchestrator: IngestionOrchestrator;
    private workspaceRoot: string;
    private pluginRoot: string;

    constructor(dbManager: MultiDbManager, pluginRoot: string) {
        this.dbManager = dbManager;
        this.workspaceRoot = dbManager.getWorkspaceRoot();
        this.pluginRoot = pluginRoot;
        this.migrationManager = new MigrationManager(dbManager, pluginRoot);
        
        // Find docs directory
        const docsPath = DocsPathResolver.findDocsDirectoryFromPath(this.workspaceRoot);
        this.ingestionOrchestrator = new IngestionOrchestrator(dbManager, this.migrationManager, docsPath || undefined);
    }

    /**
     * Validates that the workspace root and docs directory contain all required files.
     * Throws an error if validation fails.
     * 
     * @param workspaceRoot The workspace root directory
     * @param docsPath The path to the docs directory
     */
    private validateWorkspaceRoot(workspaceRoot: string, docsPath: string): void {
        const requiredPaths = [
            { path: path.join(docsPath, 'modules'), name: 'docs/modules/', isDirectory: true },
            { path: path.join(docsPath, 'index', 'symbols.jsonl'), name: 'docs/index/symbols.jsonl', isDirectory: false },
            { path: path.join(docsPath, 'system', 'DEPENDENCY_GRAPH.md'), name: 'docs/system/DEPENDENCY_GRAPH.md', isDirectory: false },
            { path: path.join(docsPath, 'adr'), name: 'docs/adr/', isDirectory: true },
            { path: path.join(docsPath, 'system', 'CHANGE_REPORT.md'), name: 'docs/system/CHANGE_REPORT.md', isDirectory: false }
        ];
        
        const missingPaths: string[] = [];
        for (const required of requiredPaths) {
            if (!fs.existsSync(required.path)) {
                missingPaths.push(required.name);
            } else {
                // Verify it's the correct type (directory vs file)
                const stats = fs.statSync(required.path);
                if (required.isDirectory && !stats.isDirectory()) {
                    missingPaths.push(`${required.name} (expected directory, found file)`);
                } else if (!required.isDirectory && !stats.isFile()) {
                    missingPaths.push(`${required.name} (expected file, found directory)`);
                }
            }
        }
        
        if (missingPaths.length > 0) {
            throw new Error(
                `Required documentation files/directories are missing:\n${missingPaths.map(p => `  - ${p}`).join('\n')}\n\n` +
                `Please run Documentation System Plugin (Noyrax) first to generate complete documentation.\n` +
                `Workspace root: ${workspaceRoot}\n` +
                `Docs directory: ${docsPath}`
            );
        }
    }

    /**
     * Performs a full ingestion of all dimensions.
     * 
     * @param pluginId The plugin ID
     * @param full Whether to perform full ingestion (default: true)
     * @returns Promise that resolves when ingestion is complete
     */
    public async ingest(pluginId: string, full: boolean = true): Promise<{ success: boolean; message: string }> {
        // Find docs directory
        const docsPath = DocsPathResolver.findDocsDirectoryFromPath(this.workspaceRoot);
        if (!docsPath) {
            throw new Error(
                `docs/ directory not found in workspace or parent directories.\n` +
                `Please run Documentation System Plugin (Noyrax) first to generate docs/ directory.\n` +
                `Workspace root: ${this.workspaceRoot}`
            );
        }

        // Validate workspace root (uses the same validation as ingest-cli)
        this.validateWorkspaceRoot(this.workspaceRoot, docsPath);

        try {
            // Run migrations
            await this.migrationManager.migrateAll();

            // Perform ingestion
            if (full) {
                await this.ingestionOrchestrator.ingestFull(this.workspaceRoot, pluginId, docsPath);
            } else {
                await this.ingestionOrchestrator.ingestIncremental(this.workspaceRoot, pluginId, docsPath);
            }

            return {
                success: true,
                message: `Ingestion completed successfully (mode: ${full ? 'full' : 'incremental'})`
            };
        } catch (error: any) {
            throw new Error(`Ingestion failed: ${error.message || String(error)}`);
        }
    }

    /**
     * Checks if ingestion is needed.
     * 
     * @returns Promise that resolves to ingestion status
     */
    public async checkIngestionStatus(): Promise<{ needed: boolean; message: string }> {
        const docsPath = DocsPathResolver.findDocsDirectoryFromPath(this.workspaceRoot);
        const dbPath = path.join(this.workspaceRoot, '.database-plugin', 'modules.db');

        if (!docsPath) {
            return { needed: false, message: 'docs/ directory not found' };
        }

        if (!fs.existsSync(dbPath)) {
            return { needed: true, message: 'Databases not found, ingestion needed' };
        }

        return { needed: false, message: 'Databases exist, ingestion may not be needed' };
    }
}

