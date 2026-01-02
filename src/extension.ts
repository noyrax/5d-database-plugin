import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { config } from 'dotenv';
import { MultiDbManager } from './core/multi-db-manager';
import { MigrationManager } from './core/migration-manager';
import { IngestionOrchestrator } from './services/ingestion-orchestrator';
import { registerCommands } from './ui/commands';
import { DatabaseExplorerProvider } from './ui/database-explorer';
import { StatusBarProvider } from './ui/status-provider';
import { DocsPathResolver } from './core/docs-path-resolver';

/**
 * Loads .env file from workspace root or parent directories.
 */
function loadEnvFile(workspaceRoot: string): void {
    // Try to find .env file in workspace root or parent directories
    let currentPath = workspaceRoot;
    const maxDepth = 5; // Prevent infinite loops
    
    for (let depth = 0; depth < maxDepth; depth++) {
        const envPath = path.join(currentPath, '.env');
        if (fs.existsSync(envPath)) {
            config({ path: envPath });
            console.log(`[5D Database Plugin] Loaded .env file from: ${envPath}`);
            return;
        }
        
        // Try parent directory
        const parentPath = path.dirname(currentPath);
        if (parentPath === currentPath) {
            break; // Reached filesystem root
        }
        currentPath = parentPath;
    }
    
    console.warn('[5D Database Plugin] No .env file found. Using environment variables only.');
}

/**
 * Activates the 5D Database Plugin extension.
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const outputChannel = vscode.window.createOutputChannel('5D Database Plugin');
    
    try {
        outputChannel.appendLine('=== 5D Database Plugin Activation Started ===');
        
        const workspaceFolders = vscode.workspace.workspaceFolders;
        outputChannel.appendLine(`Workspace folders: ${workspaceFolders ? workspaceFolders.length : 0}`);
        
        // If no workspace folder, try to use extension context storage path as fallback
        let workspaceRoot: string;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            outputChannel.appendLine('No workspace folder found, trying fallback...');
            // Fallback: Use extension context storage path parent directory
            // This allows extension to work even without a workspace folder
            const storagePath = context.storagePath || context.globalStoragePath;
            if (storagePath) {
                // Try to find workspace root by going up from storage path
                const path = require('path');
                workspaceRoot = path.dirname(path.dirname(storagePath));
                outputChannel.appendLine(`Using fallback workspace root: ${workspaceRoot}`);
            } else {
                const errorMsg = '5D Database Plugin: No workspace folder found and no storage path available';
                outputChannel.appendLine(`ERROR: ${errorMsg}`);
                outputChannel.show(true);
                vscode.window.showErrorMessage(errorMsg);
                return;
            }
        } else {
            // Use first workspace folder for database initialization
            workspaceRoot = workspaceFolders[0].uri.fsPath;
            outputChannel.appendLine(`Using workspace root: ${workspaceRoot}`);
        }

        // Load .env file from workspace root or parent directories
        outputChannel.appendLine('Loading .env file...');
        loadEnvFile(workspaceRoot);
        if (process.env.OPENAI_API_KEY) {
            outputChannel.appendLine('OpenAI API key loaded from .env file');
        } else {
            outputChannel.appendLine('WARNING: OPENAI_API_KEY not found in .env file or environment variables');
        }

        // Find docs directory across all workspace folders and parent directories
        outputChannel.appendLine('Searching for docs/ directory...');
        const docsPath = DocsPathResolver.findDocsDirectory(workspaceFolders);
        
        if (!docsPath) {
            outputChannel.appendLine('WARNING: docs/ directory not found in workspace folders or parent directories.');
            outputChannel.appendLine('The 5D Database Plugin requires the Documentation System Plugin (Noyrax) to generate docs/ first.');
            outputChannel.appendLine('Please install and run the Documentation System Plugin to generate documentation.');
            outputChannel.appendLine('Ingestion will be skipped until docs/ directory is available.');
            outputChannel.show(true);
        } else {
            outputChannel.appendLine(`Found docs/ directory: ${docsPath}`);
        }

        outputChannel.appendLine('Initializing database manager...');
        const dbManager = new MultiDbManager(workspaceRoot);
        
        outputChannel.appendLine('Initializing migration manager...');
        const migrationManager = new MigrationManager(dbManager, context.extensionPath);
        
        outputChannel.appendLine('Initializing ingestion orchestrator...');
        const ingestionOrchestrator = new IngestionOrchestrator(dbManager, migrationManager, docsPath || undefined);

        outputChannel.appendLine('Running database migrations...');
        await migrationManager.migrateAll();
        outputChannel.appendLine('Database migrations completed');

        outputChannel.appendLine('Registering UI components...');
        const statusProvider = new StatusBarProvider(context, dbManager);
        const explorerProvider = new DatabaseExplorerProvider(context, dbManager);

        context.subscriptions.push(
            vscode.window.registerTreeDataProvider('5d-database-explorer', explorerProvider),
            statusProvider
        );

        outputChannel.appendLine('Registering commands...');
        registerCommands(context, dbManager, ingestionOrchestrator, explorerProvider, docsPath || undefined);

        outputChannel.appendLine('=== 5D Database Plugin Activation Completed Successfully ===');
        vscode.window.showInformationMessage('5D Database Plugin activated');
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        outputChannel.appendLine(`ERROR during activation: ${errorMsg}`);
        if (error instanceof Error && error.stack) {
            outputChannel.appendLine(`Stack trace: ${error.stack}`);
        }
        outputChannel.show(true);
        vscode.window.showErrorMessage(`5D Database Plugin activation failed: ${errorMsg}`);
        console.error('5D Database Plugin activation error:', error);
    }
}

/**
 * Deactivates the extension.
 */
export function deactivate(): void {
    // Cleanup if needed
}

