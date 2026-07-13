#!/usr/bin/env node

import * as path from 'path';
import * as fs from 'fs';
import { config } from 'dotenv';
import { MultiDbManager } from '../core/multi-db-manager';
import { SemanticSearchApi } from '../api/semantic-search-api';
import { EmbeddingGenerator } from '../embedding/embedding-generator';
import { EmbeddingRepository } from '../repositories/embedding-repository';
import { AdrApi } from '../api/adr-api';
import { QueryRewriter } from '../services/query-rewriter';
import { DocsPathResolver } from '../core/docs-path-resolver';
import { EmbeddingPipeline } from '../embedding/embedding-pipeline';

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
 * Gets embedding content for an ADR.
 */
async function getAdrEmbeddingContent(adrNumber: string, pluginId: string, dbManager: MultiDbManager, embeddingPipeline: EmbeddingPipeline): Promise<string | null> {
    const adrApi = new AdrApi(dbManager);
    const adr = await adrApi.getAdrByNumber(adrNumber, pluginId);
    
    if (!adr) {
        return null;
    }
    
    // Extract content using the same logic as EmbeddingPipeline
    const adrDb = await dbManager.getDatabase('W');
    const { AdrRepository } = await import('../repositories/adr-repository');
    const adrRepo = new AdrRepository(adrDb);
    const fileMappings = await adrRepo.getAdrFileMappings(adr.id);
    
    const filesStr = fileMappings.length > 0 
        ? `\n\nLinked files: ${fileMappings.map(m => m.file_path).join(', ')}`
        : '';
    
    return `${adr.title}\n${adr.content_markdown}${filesStr}`;
}

/**
 * Command: content - Shows embedding content for an entity.
 */
async function commandContent(args: string[], workspaceRoot: string, dbManager: MultiDbManager, pluginId: string): Promise<void> {
    if (args.length < 2) {
        console.error('Usage: debug-semantic-search <workspace-root> content <dimension> <entity-id>');
        console.error('Example: debug-semantic-search . content W 0016');
        process.exit(1);
    }
    
    const dimension = args[0].toUpperCase();
    const entityId = args[1];
    
    if (dimension !== 'W') {
        console.error('Currently only W (ADRs) dimension is supported for content command');
        process.exit(1);
    }
    
    const embeddingGenerator = new EmbeddingGenerator();
    const embeddingPipeline = new EmbeddingPipeline(dbManager, embeddingGenerator);
    
    const content = await getAdrEmbeddingContent(entityId, pluginId, dbManager, embeddingPipeline);
    
    if (!content) {
        console.error(`ADR-${entityId} not found`);
        process.exit(1);
    }
    
    console.log(JSON.stringify({
        dimension,
        entityId,
        content,
        contentLength: content.length,
        estimatedTokens: Math.ceil(content.length / 4) // Rough estimate
    }, null, 2));
}

/**
 * Command: scores - Analyzes semantic search scores.
 */
async function commandScores(args: string[], workspaceRoot: string, dbManager: MultiDbManager, pluginId: string): Promise<void> {
    if (args.length < 1) {
        console.error('Usage: debug-semantic-search <workspace-root> scores <query> [--dimension W] [--limit 20]');
        process.exit(1);
    }
    
    let query = args[0];
    let dimension: ('X' | 'Y' | 'Z' | 'W' | 'T')[] | undefined = undefined;
    let limit = 20;
    
    // Parse optional arguments
    for (let i = 1; i < args.length; i++) {
        if (args[i] === '--dimension' && i + 1 < args.length) {
            const dim = args[i + 1].toUpperCase();
            if (['X', 'Y', 'Z', 'W', 'T'].includes(dim)) {
                dimension = [dim as 'X' | 'Y' | 'Z' | 'W' | 'T'];
            }
            i++;
        } else if (args[i] === '--limit' && i + 1 < args.length) {
            limit = parseInt(args[i + 1], 10);
            if (isNaN(limit)) {
                console.error('Error: --limit must be a number');
                process.exit(1);
            }
            i++;
        }
    }
    
    const embeddingGenerator = new EmbeddingGenerator();
    const semanticSearchApi = new SemanticSearchApi(dbManager, embeddingGenerator);
    
    const results = await semanticSearchApi.search(query, pluginId, {
        dimensions: dimension,
        limit
    });
    
    console.log(JSON.stringify({
        query,
        dimension: dimension || ['X', 'Y', 'Z', 'W', 'T'],
        limit,
        resultCount: results.length,
        results: results.map(r => ({
            dimension: r.dimension,
            externalId: r.externalId,
            score: r.score,
            vectorScore: r.vectorScore,
            importanceScore: r.importanceScore
        }))
    }, null, 2));
}

/**
 * Command: test - Tests multiple query variations for an ADR.
 */
async function commandTest(args: string[], workspaceRoot: string, dbManager: MultiDbManager, pluginId: string): Promise<void> {
    if (args.length < 1) {
        console.error('Usage: debug-semantic-search <workspace-root> test <adr-number>');
        console.error('Example: debug-semantic-search . test 0016');
        process.exit(1);
    }
    
    const adrNumber = args[0];
    
    // Generate test queries
    const testQueries = [
        `ADR-${adrNumber}`,
        `ADR ${adrNumber}`,
        adrNumber,
        `Why was ADR-${adrNumber} created?`,
        `What is ADR-${adrNumber} about?`,
        `ADR-${adrNumber} migration`,
        `TypeScript-only migration`,
        `migration TypeScript`
    ];
    
    const embeddingGenerator = new EmbeddingGenerator();
    const semanticSearchApi = new SemanticSearchApi(dbManager, embeddingGenerator);
    
    const results: Array<{
        query: string;
        found: boolean;
        rank?: number;
        score?: number;
    }> = [];
    
    for (const query of testQueries) {
        const searchResults = await semanticSearchApi.search(query, pluginId, {
            dimensions: ['W'],
            limit: 20
        });
        
        const foundIndex = searchResults.findIndex(r => r.externalId === adrNumber || r.externalId === adrNumber.padStart(3, '0') || r.externalId === adrNumber.replace(/^0+/, ''));
        const found = foundIndex >= 0;
        
        results.push({
            query,
            found,
            rank: found ? foundIndex + 1 : undefined,
            score: found ? searchResults[foundIndex].score : undefined
        });
    }
    
    console.log(JSON.stringify({
        adrNumber,
        testQueries: results
    }, null, 2));
}

/**
 * Command: rewrite - Tests query rewriting.
 */
async function commandRewrite(args: string[], workspaceRoot: string, dbManager: MultiDbManager, pluginId: string): Promise<void> {
    if (args.length < 1) {
        console.error('Usage: debug-semantic-search <workspace-root> rewrite <query>');
        console.error('Example: debug-semantic-search . rewrite "Why was Python removed?"');
        process.exit(1);
    }
    
    const query = args.join(' ');
    const queryRewriter = new QueryRewriter();
    
    const rewritten = queryRewriter.rewriteQuery(query);
    const adrNumbers = queryRewriter.extractAdrNumbers(query);
    
    console.log(JSON.stringify({
        originalQuery: query,
        rewrittenQuery: rewritten,
        extractedAdrNumbers: adrNumbers,
        changed: query !== rewritten
    }, null, 2));
}

/**
 * CLI tool for debugging semantic search and discovery.
 * Usage: debug-semantic-search <workspace-root> <command> <args...>
 * 
 * Commands:
 *   content <dimension> <entity-id>  - Show embedding content for an entity
 *   scores <query> [--dimension W] [--limit 20] - Analyze semantic search scores
 *   test <adr-number>                - Test multiple query variations for an ADR
 *   rewrite <query>                  - Test query rewriting
 */
async function main(): Promise<void> {
    const args = process.argv.slice(2);
    
    if (args.length < 2) {
        console.error('Usage: debug-semantic-search <workspace-root> <command> <args...>');
        console.error('');
        console.error('Commands:');
        console.error('  content <dimension> <entity-id>  - Show embedding content for an entity');
        console.error('  scores <query> [--dimension W] [--limit 20] - Analyze semantic search scores');
        console.error('  test <adr-number>                - Test multiple query variations for an ADR');
        console.error('  rewrite <query>                  - Test query rewriting');
        process.exit(1);
    }
    
    // Auto-detect workspace root if not provided (first arg is command)
    let workspaceRoot: string;
    let command: string;
    let commandArgs: string[];
    
    // Check if first arg is a command (no path separators) or a workspace root
    if (args.length >= 2 && !args[0].includes('/') && !args[0].includes('\\') && !path.isAbsolute(args[0]) && 
        ['content', 'scores', 'test', 'rewrite'].includes(args[0])) {
        // First arg is command, use current directory as workspace root
        workspaceRoot = process.cwd();
        command = args[0];
        commandArgs = args.slice(1);
    } else if (args.length >= 3) {
        // First arg is workspace root, second is command
        workspaceRoot = path.resolve(args[0]);
        command = args[1];
        commandArgs = args.slice(2);
    } else {
        console.error('Usage: debug-semantic-search <workspace-root> <command> <args...>');
        process.exit(1);
    }
    
    // Validate workspace root exists
    if (!fs.existsSync(workspaceRoot)) {
        console.error(`ERROR: Workspace root does not exist: ${workspaceRoot}`);
        process.exit(1);
    }
    
    // Load .env file
    loadEnvFile(workspaceRoot);
    
    // Check for Voyage API key (required for some commands)
    if (!process.env.VOYAGE_API_KEY && (command === 'scores' || command === 'test')) {
        console.error('ERROR: VOYAGE_API_KEY not found in environment or .env file');
        console.error('Semantic search requires a Voyage AI API key for embedding generation.');
        process.exit(1);
    }
    
    // Validate docs/ directory
    if (!validateDocsDirectory(workspaceRoot)) {
        process.exit(1);
    }
    
    const dbManager = new MultiDbManager(workspaceRoot);
    const pluginId = dbManager.getPluginId();
    
    try {
        switch (command) {
            case 'content':
                await commandContent(commandArgs, workspaceRoot, dbManager, pluginId);
                break;
            case 'scores':
                await commandScores(commandArgs, workspaceRoot, dbManager, pluginId);
                break;
            case 'test':
                await commandTest(commandArgs, workspaceRoot, dbManager, pluginId);
                break;
            case 'rewrite':
                await commandRewrite(commandArgs, workspaceRoot, dbManager, pluginId);
                break;
            default:
                console.error(`Unknown command: ${command}`);
                console.error('Use "content", "scores", "test", or "rewrite"');
                process.exit(1);
        }
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
    main().catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}
