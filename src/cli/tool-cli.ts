#!/usr/bin/env node

import * as path from 'path';
import * as fs from 'fs';
import { config } from 'dotenv';
import { MultiDbManager } from '../core/multi-db-manager';
import { IdMapper } from '../core/id-mapper';
import { executeBootstrap } from '../mcp/tools/bootstrap';
import { executeSemanticDiscovery } from '../mcp/tools/semantic-discovery';
import { executeSystemExplanation } from '../mcp/tools/system-explanation';
import { executeLearningPath } from '../mcp/tools/learning-path';
import { CrossAnalysisTool } from '../mcp/tools/cross-analysis';
import { GapAnalysisTool } from '../mcp/tools/gap-analysis';
import { ArchitectureMiningTool } from '../mcp/tools/architecture-mining';
import { AdrGeneratorTool } from '../mcp/tools/adr-generator';
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
 * CLI tool for executing MCP tools directly (without MCP server).
 * Usage: tool-cli <workspace-root> <tool-name> <args...>
 * 
 * Tools:
 *   bootstrap                          - Get bootstrap information
 *   semantic_discovery <query> [limit] - Semantic search with context
 *   system_explanation                 - Get system overview
 *   learning_path <topic>              - Generate learning path
 *   cross_analysis <filePath>          - Cross-dimension analysis
 */
async function main(): Promise<void> {
    const args = process.argv.slice(2);
    
    // Auto-detect workspace root if not provided
    let workspaceRoot: string;
    let toolName: string;
    let toolArgs: string[];
    
    if (args.length === 0) {
        console.error('Usage: tool-cli [<workspace-root>] <tool-name> <args...>');
        console.error('');
        console.error('If <workspace-root> is omitted, current working directory is used.');
        console.error('');
        console.error('Tools:');
        console.error('  bootstrap                          - Get bootstrap information');
        console.error('  semantic_discovery <query> [limit] - Semantic search with context');
        console.error('  system_explanation                 - Get system overview');
        console.error('  learning_path <topic>              - Generate learning path');
        console.error('  cross_analysis <filePath>          - Cross-dimension analysis');
        console.error('  gap_analysis [--min-deps N] [--limit N] [--auto-generate] - Find documentation gaps (--auto-generate: optional, default: false. When false, provides context_for_adr_generation for KI-Agent)');
        console.error('  architecture_mining [filePath]      - Mine architectural decisions from code');
        console.error('  adr_generator [--min-deps N] [--limit N] [--dry-run] [--use-llm] [--llm-model MODEL] - Reconstruct ADRs from 5D dimensions (--use-llm: use LLM for "Why" reconstruction)');
        process.exit(1);
    }
    
    // Check if first arg is a tool name (no path separators) or a workspace root
    if (args.length >= 1 && !args[0].includes('/') && !args[0].includes('\\') && !path.isAbsolute(args[0])) {
        // First arg is likely a tool name, use current directory as workspace root
        workspaceRoot = process.cwd();
        toolName = args[0];
        toolArgs = args.slice(1);
    } else if (args.length >= 2) {
        // First arg is workspace root, second is tool name
        workspaceRoot = path.resolve(args[0]);
        toolName = args[1];
        toolArgs = args.slice(2);
    } else {
        console.error('Usage: tool-cli [<workspace-root>] <tool-name> <args...>');
        console.error('If <workspace-root> is omitted, current working directory is used.');
        process.exit(1);
    }
    
    // Validate workspace root exists
    if (!fs.existsSync(workspaceRoot)) {
        console.error(`ERROR: Workspace root does not exist: ${workspaceRoot}`);
        process.exit(1);
    }

    // Canonicalize workspace root based on docs directory location (required for tool output correctness).
    // Otherwise, tools may read a different .database-plugin directory than ingestion wrote to.
    const docsPath = DocsPathResolver.findDocsDirectoryFromPath(workspaceRoot);
    if (docsPath) {
        const canonicalWorkspaceRoot = path.dirname(docsPath);
        if (canonicalWorkspaceRoot !== workspaceRoot) {
            console.warn(`[Tool CLI] WARNING: Adjusting workspace root from "${workspaceRoot}" to "${canonicalWorkspaceRoot}" (based on docs directory).`);
            workspaceRoot = canonicalWorkspaceRoot;
        }
    }
    
    // Load .env file
    loadEnvFile(workspaceRoot);
    
    // Validate docs/ directory
    if (!validateDocsDirectory(workspaceRoot)) {
        process.exit(1);
    }
    
    const dbManager = new MultiDbManager(workspaceRoot);
    const idMapper = new IdMapper(dbManager);
    const pluginId = dbManager.getPluginId();
    
    try {
        switch (toolName) {
            case 'bootstrap': {
                const result = await executeBootstrap({ pluginId }, dbManager);
                console.log(result);
                break;
            }
            
            case 'semantic_discovery': {
                if (toolArgs.length < 1) {
                    console.error('Usage: tool-cli [<workspace-root>] semantic_discovery <query> [limit]');
                    process.exit(1);
                }
                const query = toolArgs[0];
                const limit = toolArgs.length > 1 ? parseInt(toolArgs[1], 10) : 10;
                if (isNaN(limit)) {
                    console.error('Error: limit must be a number');
                    process.exit(1);
                }
                const result = await executeSemanticDiscovery(
                    { query, pluginId, limit },
                    dbManager,
                    idMapper
                );
                console.log(result);
                break;
            }
            
            case 'system_explanation': {
                const result = await executeSystemExplanation({ pluginId }, dbManager);
                console.log(result);
                break;
            }
            
            case 'learning_path': {
                if (toolArgs.length < 1) {
                    console.error('Usage: tool-cli [<workspace-root>] learning_path <topic>');
                    process.exit(1);
                }
                const topic = toolArgs[0];
                const result = await executeLearningPath({ topic, pluginId }, dbManager);
                console.log(result);
                break;
            }
            
            case 'cross_analysis': {
                if (toolArgs.length < 1) {
                    console.error('Usage: tool-cli [<workspace-root>] cross_analysis <filePath>');
                    process.exit(1);
                }
                const filePath = toolArgs[0];
                const crossAnalysisTool = new CrossAnalysisTool(dbManager, idMapper);
                const result = await crossAnalysisTool.execute({ filePath, pluginId });
                console.log(result);
                break;
            }
            
                    case 'gap_analysis': {
                        let minDeps = 5;
                        let limit = 50;
                        let autoGenerate = false;
                        
                        // Parse optional arguments
                        for (let i = 0; i < toolArgs.length; i++) {
                            if (toolArgs[i] === '--min-deps' && toolArgs[i + 1]) {
                                minDeps = parseInt(toolArgs[i + 1], 10);
                                if (isNaN(minDeps)) {
                                    console.error('Error: --min-deps must be a number');
                                    process.exit(1);
                                }
                                i++;
                            } else if (toolArgs[i] === '--limit' && toolArgs[i + 1]) {
                                limit = parseInt(toolArgs[i + 1], 10);
                                if (isNaN(limit)) {
                                    console.error('Error: --limit must be a number');
                                    process.exit(1);
                                }
                                i++;
                            } else if (toolArgs[i] === '--auto-generate') {
                                autoGenerate = true;
                            }
                        }
                        
                        const gapAnalysisTool = new GapAnalysisTool(dbManager, idMapper, workspaceRoot);
                        const result = await gapAnalysisTool.execute({ 
                            minDependencies: minDeps, 
                            pluginId,
                            limit,
                            autoGenerateAdrs: autoGenerate
                        });
                        console.log(result);
                        break;
                    }

                    case 'architecture_mining': {
                        const filePath = toolArgs.length > 0 ? toolArgs[0] : undefined;
                        const architectureMiningTool = new ArchitectureMiningTool(dbManager, idMapper);
                        const result = await architectureMiningTool.execute({ 
                            pluginId,
                            filePath
                        });
                        console.log(result);
                        break;
                    }

                    case 'adr_generator': {
                        let minDeps = 5;
                        let limit = 10;
                        let dryRun = false;
                        let useLLM = false;
                        let llmModel: string | undefined = undefined;
                        
                        // Parse optional arguments
                        for (let i = 0; i < toolArgs.length; i++) {
                            if (toolArgs[i] === '--min-deps' && toolArgs[i + 1]) {
                                minDeps = parseInt(toolArgs[i + 1], 10);
                                if (isNaN(minDeps)) {
                                    console.error('Error: --min-deps must be a number');
                                    process.exit(1);
                                }
                                i++;
                            } else if (toolArgs[i] === '--limit' && toolArgs[i + 1]) {
                                limit = parseInt(toolArgs[i + 1], 10);
                                if (isNaN(limit)) {
                                    console.error('Error: --limit must be a number');
                                    process.exit(1);
                                }
                                i++;
                            } else if (toolArgs[i] === '--dry-run') {
                                dryRun = true;
                            } else if (toolArgs[i] === '--use-llm') {
                                useLLM = true;
                            } else if (toolArgs[i] === '--llm-model' && toolArgs[i + 1]) {
                                llmModel = toolArgs[i + 1];
                                useLLM = true; // Implicitly enable LLM if model is specified
                                i++;
                            }
                        }
                        
                        const adrGeneratorTool = new AdrGeneratorTool(dbManager, idMapper, workspaceRoot);
                        const result = await adrGeneratorTool.execute({ 
                            pluginId,
                            minDependencies: minDeps,
                            limit,
                            dryRun,
                            useLLM,
                            llmModel
                        });
                        console.log(result);
                        break;
                    }
            
            default:
                console.error(`Unknown tool: ${toolName}`);
                console.error('Use "bootstrap", "semantic_discovery", "system_explanation", "learning_path", "cross_analysis", "gap_analysis", "architecture_mining", or "adr_generator"');
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
    main().catch(error => {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`Fatal error: ${errorMsg}`);
        if (error instanceof Error && error.stack) {
            console.error(`Stack trace: ${error.stack}`);
        }
        process.exit(1);
    });
}

