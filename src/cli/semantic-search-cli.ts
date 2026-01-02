#!/usr/bin/env node

import * as path from 'path';
import * as fs from 'fs';
import { config } from 'dotenv';
import { MultiDbManager } from '../core/multi-db-manager';
import { SemanticSearchApi } from '../api/semantic-search-api';
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
 * Parses command line arguments.
 */
function parseArgs(args: string[]): {
    query: string;
    limit?: number;
    dimensions?: ('X' | 'Y' | 'Z' | 'W' | 'T')[];
} {
    let query = '';
    let limit: number | undefined;
    const dimensions: ('X' | 'Y' | 'Z' | 'W' | 'T')[] = [];
    
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--limit' && i + 1 < args.length) {
            limit = parseInt(args[i + 1], 10);
            if (isNaN(limit)) {
                throw new Error('--limit must be a number');
            }
            i++;
        } else if (args[i] === '--dimensions' && i + 1 < args.length) {
            const dims = args[i + 1].split(',');
            for (const dim of dims) {
                const trimmed = dim.trim().toUpperCase();
                if (['X', 'Y', 'Z', 'W', 'T'].includes(trimmed)) {
                    dimensions.push(trimmed as 'X' | 'Y' | 'Z' | 'W' | 'T');
                } else {
                    throw new Error(`Invalid dimension: ${dim}. Must be one of: X, Y, Z, W, T`);
                }
            }
            i++;
        } else if (!query) {
            query = args[i];
        }
    }
    
    if (!query) {
        throw new Error('Query is required');
    }
    
    return {
        query,
        limit,
        dimensions: dimensions.length > 0 ? dimensions : undefined
    };
}

/**
 * CLI tool for semantic search over the V-dimension.
 * Usage: semantic-search-cli <workspace-root> <query> [--limit N] [--dimensions X,Y,Z]
 */
async function main(): Promise<void> {
    const args = process.argv.slice(2);
    
    // Auto-detect workspace root if not provided
    let workspaceRoot: string;
    let queryArgs: string[];
    
    if (args.length === 0) {
        console.error('Usage: semantic-search-cli [<workspace-root>] <query> [--limit N] [--dimensions X,Y,Z]');
        console.error('');
        console.error('If <workspace-root> is omitted, current working directory is used.');
        console.error('');
        console.error('Options:');
        console.error('  --limit N           - Maximum number of results (default: 10)');
        console.error('  --dimensions X,Y,Z  - Search in specific dimensions (default: all)');
        console.error('                       Valid dimensions: X, Y, Z, W, T');
        process.exit(1);
    }
    
    // Check if first arg is a query (no path separators) or a workspace root
    if (args.length >= 1 && !args[0].includes('/') && !args[0].includes('\\') && !path.isAbsolute(args[0]) && args[0] !== '--limit' && args[0] !== '--dimensions') {
        // First arg is likely a query, use current directory as workspace root
        workspaceRoot = process.cwd();
        queryArgs = args;
    } else if (args.length >= 2) {
        // First arg is workspace root, rest is query
        workspaceRoot = path.resolve(args[0]);
        queryArgs = args.slice(1);
    } else {
        console.error('Usage: semantic-search-cli [<workspace-root>] <query> [--limit N] [--dimensions X,Y,Z]');
        console.error('If <workspace-root> is omitted, current working directory is used.');
        process.exit(1);
    }
    
    // Validate workspace root exists
    if (!fs.existsSync(workspaceRoot)) {
        console.error(`ERROR: Workspace root does not exist: ${workspaceRoot}`);
        process.exit(1);
    }
    
    // Load .env file (required for OpenAI API key)
    loadEnvFile(workspaceRoot);
    
    // Check for OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
        console.error('ERROR: OPENAI_API_KEY not found in environment or .env file');
        console.error('Semantic search requires OpenAI API key for embedding generation.');
        process.exit(1);
    }
    
    // Validate docs/ directory
    if (!validateDocsDirectory(workspaceRoot)) {
        process.exit(1);
    }
    
    const parsedArgs = parseArgs(queryArgs);
    
    try {
        // Parse arguments
        const { query, limit, dimensions } = parsedArgs;
        
        const dbManager = new MultiDbManager(workspaceRoot);
        const pluginId = dbManager.getPluginId();
        const embeddingGenerator = new EmbeddingGenerator();
        const semanticSearchApi = new SemanticSearchApi(dbManager, embeddingGenerator);
        
        // Perform semantic search
        const results = await semanticSearchApi.search(query, pluginId, {
            limit: limit || 10,
            dimensions
        });
        
        // Output results as JSON
        console.log(JSON.stringify({
            query,
            limit: limit || 10,
            dimensions: dimensions || ['X', 'Y', 'Z', 'W', 'T'],
            results: results.map(r => ({
                dimension: r.dimension,
                entityId: r.entityId,
                externalId: r.externalId,
                score: r.score,
                vectorScore: r.vectorScore,
                importanceScore: r.importanceScore,
                entityRef: r.entityRef
            }))
        }, null, 2));
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

