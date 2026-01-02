import * as vscode from 'vscode';
import * as path from 'path';
import { MultiDbManager } from '../core/multi-db-manager';
import { IngestionOrchestrator } from '../services/ingestion-orchestrator';
import { DocsPathResolver } from '../core/docs-path-resolver';
import { DetailViewProvider } from './detail-view-provider';
import { DatabaseExplorerProvider } from './database-explorer';
import { NoyraxIntegrationService } from '../services/noyrax-integration-service';
import { WorkflowOrchestrator } from '../services/workflow-orchestrator';

/**
 * Registers all VS Code commands for the 5D Database Plugin.
 */
export function registerCommands(
    context: vscode.ExtensionContext,
    dbManager: MultiDbManager,
    ingestionOrchestrator: IngestionOrchestrator,
    explorerProvider: DatabaseExplorerProvider,
    docsPath?: string
): void {
    const detailViewProvider = new DetailViewProvider(dbManager);
    const ingestCommand = vscode.commands.registerCommand('5d-database.ingest', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('No workspace folder found');
            return;
        }

        // Use first workspace folder for plugin ID
        const workspaceRoot = workspaceFolders[0].uri.fsPath;

        // Find docs directory (may have changed since activation)
        const currentDocsPath = docsPath || DocsPathResolver.findDocsDirectory(workspaceFolders);

        if (!currentDocsPath) {
            vscode.window.showWarningMessage(
                'docs/ directory not found. The 5D Database Plugin requires the Documentation System Plugin (Noyrax) to generate docs/ first. Please install and run the Documentation System Plugin.',
                { modal: false }
            );
            return;
        }

        const pluginId = dbManager.getPluginId();
        
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Ingesting Documentation',
            cancellable: false
        }, async (progress) => {
            progress.report({ increment: 0, message: 'Starting ingestion...' });
            
            try {
                await ingestionOrchestrator.ingestIncremental(workspaceRoot, pluginId, currentDocsPath);
                progress.report({ increment: 100, message: 'Ingestion complete' });
                
                // Refresh the database explorer to show newly ingested data
                explorerProvider.refresh();
                
                vscode.window.showInformationMessage('Documentation ingested successfully');
            } catch (error) {
                vscode.window.showErrorMessage(`Ingestion failed: ${error}`);
            }
        });
    });

    const searchCommand = vscode.commands.registerCommand('5d-database.search', async () => {
        const { SearchProvider } = await import('./search-provider');
        const searchProvider = new SearchProvider(dbManager);
        await searchProvider.showSearch();
    });

    const showModuleDetailCommand = vscode.commands.registerCommand('5d-database.showModuleDetail', async (moduleId: string) => {
        await detailViewProvider.showModuleDetail(moduleId);
    });

    const showSymbolDetailCommand = vscode.commands.registerCommand('5d-database.showSymbolDetail', async (symbolId: string) => {
        await detailViewProvider.showSymbolDetail(symbolId);
    });

    const showAdrDetailCommand = vscode.commands.registerCommand('5d-database.showAdrDetail', async (adrId: string) => {
        await detailViewProvider.showAdrDetail(adrId);
    });

    const showDependencyDetailCommand = vscode.commands.registerCommand('5d-database.showDependencyDetail', async (dependencyId: string) => {
        await detailViewProvider.showDependencyDetail(dependencyId);
    });

    const showChangeDetailCommand = vscode.commands.registerCommand('5d-database.showChangeDetail', async (reportId: string) => {
        await detailViewProvider.showChangeDetail(reportId);
    });

    const openSourceFileCommand = vscode.commands.registerCommand('5d-database.openSourceFile', async (filePath: string, line?: number, column?: number) => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('No workspace folder found');
            return;
        }

        const workspaceRoot = workspaceFolders[0].uri.fsPath;
        const absolutePath = path.join(workspaceRoot, filePath);
        const uri = vscode.Uri.file(absolutePath);

        try {
            const document = await vscode.workspace.openTextDocument(uri);
            const editor = await vscode.window.showTextDocument(document);
            
            if (line !== undefined) {
                const position = new vscode.Position(
                    Math.max(0, line - 1),
                    column !== undefined ? Math.max(0, column - 1) : 0
                );
                editor.selection = new vscode.Selection(position, position);
                editor.revealRange(new vscode.Range(position, position));
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to open file: ${filePath}. Error: ${error}`);
        }
    });

    // New command: Generate documentation using Noyrax
    const generateDocsCommand = vscode.commands.registerCommand('5d-database.generate-docs', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('No workspace folder found');
            return;
        }

        const workspaceRoot = workspaceFolders[0].uri.fsPath;
        const noyraxService = new NoyraxIntegrationService(workspaceRoot);

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Generating Documentation',
            cancellable: false
        }, async (progress) => {
            progress.report({ increment: 0, message: 'Starting documentation generation...' });
            
            try {
                progress.report({ increment: 33, message: 'Running scan...' });
                await noyraxService.generateDocumentation();
                progress.report({ increment: 100, message: 'Documentation generated successfully' });
                
                vscode.window.showInformationMessage('Documentation generated successfully');
            } catch (error: any) {
                const errorMessage = error.message || String(error);
                vscode.window.showErrorMessage(`Documentation generation failed: ${errorMessage}`);
            }
        });
    });

    // New command: Full workflow (Generate docs + Ingest)
    const fullWorkflowCommand = vscode.commands.registerCommand('5d-database.full-workflow', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('No workspace folder found');
            return;
        }

        const workspaceRoot = workspaceFolders[0].uri.fsPath;
        const workflowOrchestrator = new WorkflowOrchestrator(
            workspaceRoot,
            dbManager,
            ingestionOrchestrator
        );

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Running Full Workflow',
            cancellable: false
        }, async (progress) => {
            progress.report({ increment: 0, message: 'Starting full workflow...' });
            
            try {
                progress.report({ increment: 20, message: 'Generating documentation...' });
                const result = await workflowOrchestrator.runFullWorkflow({
                    generateDocs: true,
                    fullIngestion: false,
                    generateEmbeddings: true,
                    skipIfUpToDate: false
                });

                if (result.success) {
                    progress.report({ increment: 100, message: 'Workflow completed successfully' });
                    
                    // Refresh the database explorer to show newly ingested data
                    explorerProvider.refresh();
                    
                    let message = 'Full workflow completed successfully';
                    if (result.warnings && result.warnings.length > 0) {
                        message += ` (${result.warnings.length} warning(s))`;
                    }
                    vscode.window.showInformationMessage(message);
                } else {
                    const errorMessage = result.errors?.join(', ') || 'Unknown error';
                    vscode.window.showErrorMessage(`Workflow failed: ${errorMessage}`);
                }
            } catch (error: any) {
                const errorMessage = error.message || String(error);
                vscode.window.showErrorMessage(`Workflow failed: ${errorMessage}`);
            }
        });
    });

    // New command: Merge workspaces (combine both systems into one database)
    const mergeWorkspacesCommand = vscode.commands.registerCommand('5d-database.merge-workspaces', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('No workspace folder found');
            return;
        }

        const workspaceRoot = workspaceFolders[0].uri.fsPath;
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);
        const mergeCliPath = path.join(__dirname, '..', '..', 'out', 'cli', 'merge-workspaces-cli.js');

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Merging Workspaces',
            cancellable: false
        }, async (progress) => {
            progress.report({ increment: 0, message: 'Starting workspace merge...' });
            
            try {
                progress.report({ increment: 50, message: 'Merging documentation from both systems...' });
                const { stdout, stderr } = await execAsync(`node "${mergeCliPath}" "${workspaceRoot}" --full`, {
                    cwd: workspaceRoot,
                    maxBuffer: 10 * 1024 * 1024 // 10MB buffer
                });

                if (stderr && !stderr.includes('WARN')) {
                    console.warn('[Merge Workspaces] Warnings:', stderr);
                }

                progress.report({ increment: 100, message: 'Merge completed successfully' });
                
                // Refresh the database explorer to show merged data
                explorerProvider.refresh();
                
                vscode.window.showInformationMessage('Workspaces merged successfully. Both systems are now in one database.');
            } catch (error: any) {
                const errorMessage = error.message || String(error);
                vscode.window.showErrorMessage(`Workspace merge failed: ${errorMessage}`);
            }
        });
    });

    context.subscriptions.push(
        ingestCommand,
        searchCommand,
        showModuleDetailCommand,
        showSymbolDetailCommand,
        showAdrDetailCommand,
        showDependencyDetailCommand,
        showChangeDetailCommand,
        openSourceFileCommand,
        generateDocsCommand,
        fullWorkflowCommand,
        mergeWorkspacesCommand,
        detailViewProvider
    );
}

