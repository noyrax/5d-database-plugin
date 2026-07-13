import { SourceSnippetApi } from '../../api/source-snippet-api.js';
import { MultiDbManager } from '../../core/multi-db-manager.js';

/**
 * MCP Tool: source_snippet
 * Fetch source code snippet by reference (gated, refs-first)
 */
export const sourceSnippetTool = {
    name: 'source_snippet',
    description: 'Fetch source code snippet by reference (gated, refs-first). ' +
                 'Retrieves actual source code for a symbol or file range with size limits and hash verification.',
    inputSchema: {
        type: 'object',
        properties: {
            symbol_id: {
                type: 'string',
                description: 'Symbol ID to fetch (e.g., "ts://path/to/file.ts#ClassName.methodName()")'
            },
            file_path: {
                type: 'string',
                description: 'File path (alternative to symbol_id)'
            },
            start_line: {
                type: 'number',
                description: 'Start line number (1-indexed, alternative to symbol_id)'
            },
            end_line: {
                type: 'number',
                description: 'End line number (1-indexed, inclusive, alternative to symbol_id)'
            },
            content_hash: {
                type: 'string',
                description: 'Expected content hash for verification (optional)'
            },
            include_context: {
                type: 'boolean',
                description: 'Include context lines before/after (default: false)'
            },
            context_lines: {
                type: 'number',
                description: 'Number of context lines (default: 5)'
            },
            verify_hash: {
                type: 'boolean',
                description: 'Fail if hash mismatch (default: false)'
            },
            pluginId: {
                type: 'string',
                description: 'Plugin ID'
            },
            workspaceRoot: {
                type: 'string',
                description: 'Workspace root path (optional)'
            }
        },
        required: ['pluginId']
    }
};

/**
 * Executes source_snippet tool.
 */
export async function executeSourceSnippet(
    args: {
        symbol_id?: string;
        file_path?: string;
        start_line?: number;
        end_line?: number;
        content_hash?: string;
        include_context?: boolean;
        context_lines?: number;
        verify_hash?: boolean;
        pluginId: string;
        workspaceRoot?: string;
    },
    dbManager: MultiDbManager
): Promise<string> {
    try {
        const api = new SourceSnippetApi(dbManager);
        const result = await api.fetchSnippet(args);
        
        return JSON.stringify(result, null, 2);
    } catch (error: any) {
        const errorMsg = error?.message || String(error);
        return JSON.stringify({
            error: `Failed to fetch source snippet: ${errorMsg}`,
            evidence: {
                grade: 'INFERRED',
                sources: [],
                description: `Error: ${errorMsg}`
            }
        }, null, 2);
    }
}

