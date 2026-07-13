#!/usr/bin/env node

import * as path from 'path';
import * as fs from 'fs';
import { config } from 'dotenv';
import { MultiDbManager } from '../core/multi-db-manager';
import { EmbeddingPipeline } from '../embedding/embedding-pipeline';
import { EmbeddingGenerator } from '../embedding/embedding-generator';
import { DocsPathResolver } from '../core/docs-path-resolver';

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
            return;
        }
        
        const parentPath = path.dirname(currentPath);
        if (parentPath === currentPath) {
            break;
        }
        currentPath = parentPath;
    }
}

/**
 * Validates that docs/ directory exists.
 */
function validateDocsDirectory(workspaceRoot: string): boolean {
    const docsPath = DocsPathResolver.findDocsDirectoryFromPath(workspaceRoot);
    if (!docsPath) {
        console.error('ERROR: docs/ directory not found in workspace or parent directories.');
        console.error('Please run Documentation System Plugin (Noyrax) first to generate docs/ directory.');
        return false;
    }
    return true;
}

/**
 * CLI tool for syncing embeddings (V-Dimension).
 * Usage: embedding-cli <workspace-root>
 */
async function main(): Promise<void> {
    const args = process.argv.slice(2);
    
    // Auto-detect workspace root if not provided
    let workspaceRoot: string;
    
    if (args.length === 0) {
        // No arguments: use current working directory
        workspaceRoot = process.cwd();
    } else {
        workspaceRoot = path.resolve(args[0]);
    }
    
    // Validate workspace root exists
    if (!fs.existsSync(workspaceRoot)) {
        console.error(`ERROR: Workspace root does not exist: ${workspaceRoot}`);
        console.error('');
        console.error('Usage: embedding-cli [<workspace-root>]');
        console.error('If <workspace-root> is omitted, current working directory is used.');
        console.error('');
        console.error('This tool syncs embeddings for all 5 dimensions (X, Y, Z, W, T).');
        console.error('It requires:');
        console.error('  - VOYAGE_API_KEY in .env file or environment');
        console.error('  - ChromaDB Server running (on Windows) or SQLite VSS (on macOS/Linux)');
        console.error('  - Existing 5D database with ingested data');
        process.exit(1);
    }
    
    // Validate workspace root exists
    if (!fs.existsSync(workspaceRoot)) {
        console.error(`ERROR: Workspace root does not exist: ${workspaceRoot}`);
        process.exit(1);
    }
    
    // Load .env file (required for Voyage API key)
    loadEnvFile(workspaceRoot);

    // Check for Voyage API key
    if (!process.env.VOYAGE_API_KEY) {
        console.error('ERROR: VOYAGE_API_KEY not found in environment or .env file');
        console.error('Embedding generation requires a Voyage AI API key.');
        process.exit(1);
    }
    
    // Validate docs/ directory (for context)
    validateDocsDirectory(workspaceRoot);
    
    try {
        console.log(`[Embedding CLI] Starting embedding sync for workspace: ${workspaceRoot}`);
        
        const dbManager = new MultiDbManager(workspaceRoot);
        const pluginId = dbManager.getPluginId();
        
        // Check vector database availability
        const vectorDb = dbManager.getVectorDatabase();
        if (vectorDb) {
            if (vectorDb.isAvailable()) {
                console.log(`[Embedding CLI] Vector database available: ${vectorDb.constructor.name}`);
            } else {
                console.warn('[Embedding CLI] Vector database initialized but not available.');
                console.warn('[Embedding CLI] Will store embeddings in SQLite only (fallback to cosine similarity).');
                console.warn('[Embedding CLI] On Windows: Make sure ChromaDB server is running: chroma run --host localhost --port 8000');
            }
        } else {
            console.warn('[Embedding CLI] Vector database not initialized. Embeddings will be stored in SQLite only.');
        }
        
        const embeddingGenerator = new EmbeddingGenerator();
        const embeddingPipeline = new EmbeddingPipeline(dbManager, embeddingGenerator);
        
        // Sync embeddings for all dimensions
        await embeddingPipeline.syncEmbeddings(pluginId);
        
        console.log('[Embedding CLI] Embedding sync completed successfully!');
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`Error: ${errorMsg}`);
        if (error instanceof Error && error.stack) {
            console.error(`Stack trace: ${error.stack}`);
        }
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(error => {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`Fatal error: ${errorMsg}`);
        if (error instanceof Error && error.stack) {
            console.error(`Stack trace: ${error.stack}`);
        }
        process.exit(1);
    });
}

