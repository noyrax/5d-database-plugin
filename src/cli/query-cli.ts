#!/usr/bin/env node

import * as path from 'path';
import * as fs from 'fs';
import { config } from 'dotenv';
import { MultiDbManager } from '../core/multi-db-manager';
import { ModuleApi } from '../api/module-api';
import { SymbolApi } from '../api/symbol-api';
import { DependencyApi } from '../api/dependency-api';
import { AdrApi } from '../api/adr-api';
import { ChangeApi } from '../api/change-api';
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
 * CLI tool for querying the 5D database directly.
 * Usage: query-cli <workspace-root> <command> <args...>
 * 
 * Commands:
 *   modules <filePath>        - Query module by file path
 *   symbols <path|symbolId>   - Query symbols by path or symbol ID
 *   dependencies <--from <path>|--to <path>> - Query dependencies
 *   adrs <--number <num>|--path <path>> - Query ADRs
 *   changes                   - Query change reports
 */
async function main(): Promise<void> {
    const args = process.argv.slice(2);
    
    // Auto-detect workspace root if not provided
    let workspaceRoot: string;
    let command: string;
    let commandArgs: string[];
    
    if (args.length === 0) {
        console.error('Usage: query-cli [<workspace-root>] <command> <args...>');
        console.error('');
        console.error('If <workspace-root> is omitted, current working directory is used.');
        console.error('');
        console.error('Commands:');
        console.error('  modules <filePath>              - Query module by file path');
        console.error('  symbols <path|symbolId>         - Query symbols by path or symbol ID');
        console.error('  dependencies --from <path>      - Query dependencies by from module');
        console.error('  dependencies --to <path>        - Query dependencies by to module');
        console.error('  adrs --number <num>             - Query ADR by number');
        console.error('  adrs --path <path>              - Query ADRs by file path');
        console.error('  changes                         - Query all change reports');
        process.exit(1);
    }
    
    // Check if first arg is a command (no path separators) or a workspace root
    if (args.length >= 1 && !args[0].includes('/') && !args[0].includes('\\') && !path.isAbsolute(args[0]) && 
        ['modules', 'symbols', 'dependencies', 'adrs', 'changes'].includes(args[0])) {
        // First arg is a command, use current directory as workspace root
        workspaceRoot = process.cwd();
        command = args[0];
        commandArgs = args.slice(1);
    } else if (args.length >= 2) {
        // First arg is workspace root, second is command
        workspaceRoot = path.resolve(args[0]);
        command = args[1];
        commandArgs = args.slice(2);
    } else {
        console.error('Usage: query-cli [<workspace-root>] <command> <args...>');
        console.error('If <workspace-root> is omitted, current working directory is used.');
        process.exit(1);
    }
    
    // Validate workspace root exists
    if (!fs.existsSync(workspaceRoot)) {
        console.error(`ERROR: Workspace root does not exist: ${workspaceRoot}`);
        process.exit(1);
    }
    
    // Canonicalize workspace root based on docs directory location (if available).
    // This prevents mismatches where ingestion was run from a subfolder but docs were found in a parent directory.
    const docsPath = DocsPathResolver.findDocsDirectoryFromPath(workspaceRoot);
    if (docsPath) {
        const canonicalWorkspaceRoot = path.dirname(docsPath);
        if (canonicalWorkspaceRoot !== workspaceRoot) {
            console.warn(`[Query CLI] WARNING: Adjusting workspace root from "${workspaceRoot}" to "${canonicalWorkspaceRoot}" (based on docs directory).`);
            workspaceRoot = canonicalWorkspaceRoot;
        }
    }

    // Load .env file
    loadEnvFile(workspaceRoot);
    
    // Validate docs/ directory (for context, but not strictly required for queries)
    validateDocsDirectory(workspaceRoot);
    
    const dbManager = new MultiDbManager(workspaceRoot);
    const pluginId = dbManager.getPluginId();
    
    try {
        switch (command) {
            case 'modules': {
                if (commandArgs.length < 1) {
                    console.error('Usage: query-cli [<workspace-root>] modules <filePath>');
                    process.exit(1);
                }
                const filePath = commandArgs[0];
                const moduleApi = new ModuleApi(dbManager);
                const module = await moduleApi.getModuleByPath(filePath, pluginId);
                if (module) {
                    console.log(JSON.stringify(module, null, 2));
                } else {
                    console.error(`Module not found: ${filePath}`);
                    process.exit(1);
                }
                break;
            }
            
            case 'symbols': {
                if (commandArgs.length < 1) {
                    console.error('Usage: query-cli [<workspace-root>] symbols <path|symbolId>');
                    process.exit(1);
                }
                const symbolApi = new SymbolApi(dbManager);
                const identifier = commandArgs[0];
                let symbols;
                
                // Try as symbolId first (usually UUID-like), then as path
                if (identifier.includes('/') || identifier.includes('\\')) {
                    symbols = await symbolApi.getSymbolsByPath(identifier, pluginId);
                } else {
                    const symbol = await symbolApi.getSymbolById(identifier, pluginId);
                    symbols = symbol ? [symbol] : [];
                }
                
                console.log(JSON.stringify(symbols, null, 2));
                break;
            }
            
            case 'dependencies': {
                const dependencyApi = new DependencyApi(dbManager);
                let dependencies;
                
                if (commandArgs.length >= 2 && commandArgs[0] === '--from') {
                    dependencies = await dependencyApi.getDependenciesByFromModule(commandArgs[1], pluginId);
                } else if (commandArgs.length >= 2 && commandArgs[0] === '--to') {
                    dependencies = await dependencyApi.getDependenciesByToModule(commandArgs[1], pluginId);
                } else {
                    dependencies = await dependencyApi.getAllDependencies(pluginId);
                }
                
                console.log(JSON.stringify(dependencies, null, 2));
                break;
            }
            
            case 'adrs': {
                const adrApi = new AdrApi(dbManager);
                let adrs;
                
                if (commandArgs.length >= 2 && commandArgs[0] === '--number') {
                    const adr = await adrApi.getAdrByNumber(commandArgs[1], pluginId);
                    adrs = adr ? [adr] : [];
                } else if (commandArgs.length >= 2 && commandArgs[0] === '--path') {
                    adrs = await adrApi.getAdrsByFilePath(commandArgs[1], pluginId);
                } else {
                    adrs = await adrApi.getAllAdrs(pluginId);
                }
                
                console.log(JSON.stringify(adrs, null, 2));
                break;
            }
            
            case 'changes': {
                const changeApi = new ChangeApi(dbManager);
                const changes = await changeApi.getAllChangeReports(pluginId);
                console.log(JSON.stringify(changes, null, 2));
                break;
            }
            
            default:
                console.error(`Unknown command: ${command}`);
                console.error('Use "modules", "symbols", "dependencies", "adrs", or "changes"');
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

