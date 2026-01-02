#!/usr/bin/env node

import * as path from 'path';
import * as fs from 'fs';
import { config } from 'dotenv';
import { MultiDbManager } from '../core/multi-db-manager';
import { MigrationManager } from '../core/migration-manager';
import { IngestionOrchestrator } from '../services/ingestion-orchestrator';
import { DocsPathResolver } from '../core/docs-path-resolver';

/**
 * Validates that the workspace root and docs directory contain all required files.
 * Throws an error and exits if validation fails.
 * 
 * @param workspaceRoot The workspace root directory
 * @param docsPath The path to the docs directory
 */
function validateWorkspaceRoot(workspaceRoot: string, docsPath: string): void {
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
        console.error('ERROR: Required documentation files/directories are missing:');
        missingPaths.forEach(p => console.error(`  - ${p}`));
        console.error('');
        console.error('Please run Documentation System Plugin (Noyrax) first to generate complete documentation.');
        console.error(`Workspace root: ${workspaceRoot}`);
        console.error(`Docs directory: ${docsPath}`);
        process.exit(1);
    }
}

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
            console.log(`[Ingest CLI] Loaded .env file from: ${envPath}`);
            return;
        }
        
        // Try parent directory
        const parentPath = path.dirname(currentPath);
        if (parentPath === currentPath) {
            break; // Reached filesystem root
        }
        currentPath = parentPath;
    }
    
    console.warn('[Ingest CLI] No .env file found. Using environment variables only.');
}

/**
 * CLI tool for ingesting documentation into the 5D database.
 * Usage: node ingest-cli.js <workspace-root> [--full]
 */
async function main(): Promise<void> {
    const args = process.argv.slice(2);
    
    // Auto-detect workspace root if not provided
    let workspaceRoot: string;
    let isFull: boolean;
    
    if (args.length === 0) {
        // No arguments: use current working directory
        workspaceRoot = process.cwd();
        isFull = false;
    } else if (args[0] === '--full') {
        // First arg is --full: use current working directory
        workspaceRoot = process.cwd();
        isFull = true;
    } else if (args.includes('--full')) {
        // Workspace root provided, --full flag present
        workspaceRoot = path.resolve(args[0]);
        isFull = true;
    } else {
        // Workspace root provided, no --full flag
        workspaceRoot = path.resolve(args[0]);
        isFull = false;
    }

    // Load .env file from workspace root or parent directories
    loadEnvFile(workspaceRoot);
    if (process.env.OPENAI_API_KEY) {
        console.log('[Ingest CLI] OpenAI API key loaded from .env file');
    } else {
        console.warn('[Ingest CLI] WARNING: OPENAI_API_KEY not found in .env file or environment variables');
    }

    console.log(`Ingesting documentation from: ${workspaceRoot}`);
    console.log(`Mode: ${isFull ? 'full' : 'incremental'}`);
    
    // Find docs directory (dependency on Documentation System Plugin)
    const docsPath = DocsPathResolver.findDocsDirectoryFromPath(workspaceRoot);
    if (!docsPath) {
        console.error('ERROR: docs/ directory not found in workspace or parent directories.');
        console.error('Please run Documentation System Plugin (Noyrax) first to generate docs/ directory.');
        console.error(`Workspace root: ${workspaceRoot}`);
        process.exit(1);
    }
    console.log(`Found docs directory: ${docsPath}`);

    // Canonicalize workspace root: the DBs MUST live next to the docs owner root.
    // Otherwise it's easy to ingest docs from a parent directory but write DBs into a subfolder (.database-plugin mismatch).
    const canonicalWorkspaceRoot = path.dirname(docsPath);
    if (canonicalWorkspaceRoot !== workspaceRoot) {
        console.warn(`[Ingest CLI] WARNING: Adjusting workspace root from "${workspaceRoot}" to "${canonicalWorkspaceRoot}" (based on docs directory).`);
        workspaceRoot = canonicalWorkspaceRoot;
    }
    console.log(`[Ingest CLI] Using workspace root for databases: ${workspaceRoot}`);
    
    const dbManager = new MultiDbManager(workspaceRoot);
    const pluginRoot = path.resolve(__dirname, '..', '..');
    const migrationManager = new MigrationManager(dbManager, pluginRoot);
    
    // Validate that required documentation files exist (hard validation - exits on failure)
    validateWorkspaceRoot(workspaceRoot, docsPath);
    
    const ingestionOrchestrator = new IngestionOrchestrator(dbManager, migrationManager, docsPath);

    try {
        await migrationManager.migrateAll();
        console.log('Database migrations completed');

        const pluginId = dbManager.getPluginId();
        
        if (isFull) {
            await ingestionOrchestrator.ingestFull(workspaceRoot, pluginId, docsPath);
        } else {
            await ingestionOrchestrator.ingestIncremental(workspaceRoot, pluginId, docsPath);
        }

        console.log('Ingestion completed successfully');
        process.exit(0);
    } catch (error) {
        console.error('Ingestion failed:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

