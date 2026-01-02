/**
 * MCP types for 5D Database Plugin
 */

export interface McpResource {
    uri: string;
    name: string;
    description?: string;
    mimeType?: string;
}

export interface McpTool {
    name: string;
    description: string;
    inputSchema: {
        type: 'object';
        properties: Record<string, any>;
        required?: string[];
    };
}

