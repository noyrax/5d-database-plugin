#!/usr/bin/env node

import * as path from 'path';
import * as fs from 'fs';
import { config } from 'dotenv';
import { MultiDbManager } from '../core/multi-db-manager';
import { MigrationManager } from '../core/migration-manager';
import { IngestionOrchestrator } from '../services/ingestion-orchestrator';
import { DocsPathResolver } from '../core/docs-path-resolver';
import * as crypto from 'crypto';

/**
 * Loads .env file from workspace root or parent directories.
 */
function loadEnvFile(workspaceRoot: string): void {
    let currentPath = workspaceRoot;
    const maxDepth = 5;
    
    for (let depth = 0; depth < maxDepth; depth++) {
        const envPath = path.join(currentPath, '.env');
        if (fs.existsSync(envPath)) {
            config({ path: envPath });
            console.log(`[Merge Workspaces CLI] Loaded .env file from: ${envPath}`);
            return;
        }
        
        const parentPath = path.dirname(currentPath);
        if (parentPath === currentPath) {
            break;
        }
        currentPath = parentPath;
    }
    
    console.warn('[Merge Workspaces CLI] No .env file found. Using environment variables only.');
}

/**
 * Computes a stable plugin_id from a workspace root path.
 */
function computePluginId(workspaceRoot: string): string {
    const normalizedPath = path.resolve(workspaceRoot).replace(/\\/g, '/').toLowerCase();
    const hash = crypto.createHash('sha256').update(normalizedPath).digest('hex');
    return hash.substring(0, 16);
}

/**
 * CLI tool for merging multiple workspace documentations into a single database.
 * Usage: node merge-workspaces-cli.js <target-workspace-root> [--source <source-workspace-root>] [--full]
 */
async function main(): Promise<void> {
    const args = process.argv.slice(2);
    
    let targetWorkspaceRoot: string = process.cwd();
    let sourceWorkspaceRoot: string | null = null;
    let isFull: boolean = false;
    
    // Parse arguments
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--source' && i + 1 < args.length) {
            sourceWorkspaceRoot = path.resolve(args[i + 1]);
            i++;
        } else if (args[i] === '--full') {
            isFull = true;
        } else if (targetWorkspaceRoot === process.cwd()) {
            // First non-flag argument becomes target workspace root
            targetWorkspaceRoot = path.resolve(args[i]);
        }
    }
    
    // Load .env file
    loadEnvFile(targetWorkspaceRoot);
    if (process.env.VOYAGE_API_KEY) {
        console.log('[Merge Workspaces CLI] Voyage API key loaded from .env file');
    } else {
        console.warn('[Merge Workspaces CLI] WARNING: VOYAGE_API_KEY not found in .env file or environment variables (embeddings will be skipped)');
    }
    
    console.log(`Target workspace root: ${targetWorkspaceRoot}`);
    console.log(`Mode: ${isFull ? 'full' : 'incremental'}`);
    
    // Initialize target database manager (this will be the main database)
    const targetDbManager = new MultiDbManager(targetWorkspaceRoot);
    const pluginRoot = path.resolve(__dirname, '..', '..');
    const migrationManager = new MigrationManager(targetDbManager, pluginRoot);
    const targetPluginId = targetDbManager.getPluginId();
    
    console.log(`Target plugin ID: ${targetPluginId}`);
    
    // Run migrations
    await migrationManager.migrateAll();
    console.log('Database migrations completed');
    
    // List of workspaces to merge
    const workspacesToMerge: Array<{ root: string; docsPath: string; name: string }> = [];
    
    // 1. Target workspace (always included)
    const targetDocsPath = DocsPathResolver.findDocsDirectoryFromPath(targetWorkspaceRoot);
    if (targetDocsPath) {
        workspacesToMerge.push({
            root: targetWorkspaceRoot,
            docsPath: targetDocsPath,
            name: 'Target Workspace'
        });
        console.log(`Found target docs directory: ${targetDocsPath}`);
    } else {
        console.warn('WARNING: Target workspace docs/ directory not found. Skipping target workspace.');
    }
    
    // 2. Source workspace (if specified)
    if (sourceWorkspaceRoot) {
        const sourceDocsPath = DocsPathResolver.findDocsDirectoryFromPath(sourceWorkspaceRoot);
        if (sourceDocsPath) {
            workspacesToMerge.push({
                root: sourceWorkspaceRoot,
                docsPath: sourceDocsPath,
                name: 'Source Workspace'
            });
            console.log(`Found source docs directory: ${sourceDocsPath}`);
        } else {
            console.warn(`WARNING: Source workspace docs/ directory not found: ${sourceWorkspaceRoot}`);
        }
    }
    
    // 3. Auto-detect documentation-system-plugin if it exists
    const documentationSystemPluginPath = path.join(targetWorkspaceRoot, 'documentation-system-plugin');
    if (fs.existsSync(documentationSystemPluginPath)) {
        const noyraxDocsPath = DocsPathResolver.findDocsDirectoryFromPath(documentationSystemPluginPath);
        if (noyraxDocsPath) {
            // Check if not already added as source
            const alreadyAdded = workspacesToMerge.some(w => w.docsPath === noyraxDocsPath);
            if (!alreadyAdded) {
                workspacesToMerge.push({
                    root: documentationSystemPluginPath,
                    docsPath: noyraxDocsPath,
                    name: 'Documentation System Plugin (Noyrax)'
                });
                console.log(`Found Documentation System Plugin docs directory: ${noyraxDocsPath}`);
            }
        }
    }
    
    if (workspacesToMerge.length === 0) {
        console.error('ERROR: No docs/ directories found to merge.');
        console.error('Please ensure at least one workspace has a docs/ directory.');
        process.exit(1);
    }
    
    console.log(`\nMerging ${workspacesToMerge.length} workspace(s) into target database (plugin_id: ${targetPluginId})...`);
    
    // Create ingestion orchestrator
    const ingestionOrchestrator = new IngestionOrchestrator(targetDbManager, migrationManager);
    
    // Ingest each workspace into the target database
    for (const workspace of workspacesToMerge) {
        console.log(`\n--- Ingesting ${workspace.name} ---`);
        console.log(`  Workspace root: ${workspace.root}`);
        console.log(`  Docs path: ${workspace.docsPath}`);
        
        try {
            if (isFull) {
                await ingestionOrchestrator.ingestFull(targetWorkspaceRoot, targetPluginId, workspace.docsPath);
            } else {
                await ingestionOrchestrator.ingestIncremental(targetWorkspaceRoot, targetPluginId, workspace.docsPath);
            }
            console.log(`✓ Successfully ingested ${workspace.name}`);
        } catch (error: any) {
            console.error(`✗ Failed to ingest ${workspace.name}: ${error.message}`);
            console.error(error);
        }
    }
    
    console.log('\n=== Merge completed successfully ===');
    console.log(`All workspaces merged into database at: ${targetDbManager.getDbDirectory()}`);
    console.log(`Plugin ID: ${targetPluginId}`);
    process.exit(0);
}

main().catch((error) => {
    console.error('Merge failed:', error);
    process.exit(1);
});

