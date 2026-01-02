#!/usr/bin/env node

import * as path from 'path';
import * as fs from 'fs';
import { config } from 'dotenv';
import { DatabaseMcpServer } from '../mcp/server';
import { DocsPathResolver } from '../core/docs-path-resolver';

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
            // Don't log to stdout - MCP uses stdout for protocol
            return;
        }
        
        // Try parent directory
        const parentPath = path.dirname(currentPath);
        if (parentPath === currentPath) {
            break; // Reached filesystem root
        }
        currentPath = parentPath;
    }
}

/**
 * Validates that docs/ directory exists (dependency on Documentation System Plugin).
 * Logs errors to stderr (not stdout, as MCP uses stdout for protocol).
 */
function validateDocsDirectory(workspaceRoot: string): boolean {
    const docsPath = DocsPathResolver.findDocsDirectoryFromPath(workspaceRoot);
    if (!docsPath) {
        const error = `ERROR: docs/ directory not found in workspace or parent directories.\n` +
                     `Please run Documentation System Plugin (Noyrax) first to generate docs/ directory.\n` +
                     `Workspace root: ${workspaceRoot}`;
        // Use stderr for errors - MCP protocol uses stdout
        process.stderr.write(error + '\n');
        return false;
    }
    
    // Validate that required subdirectories/files exist
    const requiredPaths = [
        path.join(docsPath, 'modules'),
        path.join(docsPath, 'index', 'symbols.jsonl'),
        path.join(docsPath, 'system', 'DEPENDENCY_GRAPH.md'),
        path.join(docsPath, 'adr'),
        path.join(docsPath, 'system', 'CHANGE_REPORT.md')
    ];
    
    const missingPaths: string[] = [];
    for (const requiredPath of requiredPaths) {
        if (!fs.existsSync(requiredPath)) {
            missingPaths.push(requiredPath);
        }
    }
    
    if (missingPaths.length > 0) {
        const error = `WARNING: Some required documentation files are missing:\n` +
                     missingPaths.map(p => `  - ${p}`).join('\n') +
                     `\nPlease ensure Documentation System Plugin has generated complete documentation.`;
        process.stderr.write(error + '\n');
        // Don't fail - some files might be optional, but warn
    }
    
    return true;
}

/**
 * CLI entry point for MCP Server.
 * Usage: node mcp-server-cli.js <workspace-root>
 * 
 * Starts the MCP server and communicates via stdin/stdout (JSON-RPC 2.0).
 * Errors are written to stderr to avoid interfering with MCP protocol.
 */
async function main(): Promise<void> {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        const usage = 'Usage: mcp-server-cli <workspace-root>\n' +
                     '\n' +
                     'Starts the 5D Database MCP Server for LLM-Agent integration.\n' +
                     'The server communicates via stdin/stdout using JSON-RPC 2.0 protocol.\n' +
                     '\n' +
                     'Prerequisites:\n' +
                     '  - Documentation System Plugin (Noyrax) must have generated docs/ directory\n' +
                     '  - 5D Database Plugin must have ingested the documentation (run ingest-cli first)';
        process.stderr.write(usage + '\n');
        process.exit(1);
    }

    const workspaceRoot = path.resolve(args[0]);
    
    // Validate workspace root exists
    if (!fs.existsSync(workspaceRoot)) {
        process.stderr.write(`ERROR: Workspace root does not exist: ${workspaceRoot}\n`);
        process.exit(1);
    }
    
    // Load .env file (silently - don't log to stdout)
    loadEnvFile(workspaceRoot);
    
    // Validate docs/ directory exists (dependency on Documentation System Plugin)
    if (!validateDocsDirectory(workspaceRoot)) {
        process.exit(1);
    }
    
    try {
        // Create and start MCP server
        const server = new DatabaseMcpServer(workspaceRoot);
        await server.start();
        // Server runs indefinitely, communicating via stdin/stdout
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        process.stderr.write(`Fatal error starting MCP server: ${errorMsg}\n`);
        if (error instanceof Error && error.stack) {
            process.stderr.write(`Stack trace: ${error.stack}\n`);
        }
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(error => {
        const errorMsg = error instanceof Error ? error.message : String(error);
        process.stderr.write(`Fatal error: ${errorMsg}\n`);
        if (error instanceof Error && error.stack) {
            process.stderr.write(`Stack trace: ${error.stack}\n`);
        }
        process.exit(1);
    });
}
