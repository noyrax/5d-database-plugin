import { SourceAccessContractApi } from '../../api/source-access-contract-api.js';
import { MultiDbManager } from '../../core/multi-db-manager.js';

/**
 * MCP Tool: source_access_contract
 * Get source access contract (deterministic status of code availability)
 */
export const sourceAccessContractTool = {
    name: 'source_access_contract',
    description: 'Get source access contract (deterministic status of code availability). ' +
                 'Returns whether source code is available, constraints, and reason codes.',
    inputSchema: {
        type: 'object',
        properties: {
            workspaceRoot: {
                type: 'string',
                description: 'Workspace root path (optional, defaults to current working directory)'
            }
        },
        required: []
    }
};

/**
 * Executes source_access_contract tool.
 */
export async function executeSourceAccessContract(
    args: { workspaceRoot?: string },
    dbManager: MultiDbManager
): Promise<string> {
    try {
        const api = new SourceAccessContractApi(dbManager);
        // Use workspace root from dbManager if not provided
        const workspaceRoot = args.workspaceRoot || dbManager.getWorkspaceRoot();
        const contract = await api.getContract(workspaceRoot);
        
        return JSON.stringify(contract, null, 2);
    } catch (error: any) {
        const errorMsg = error?.message || String(error);
        return JSON.stringify({
            error: `Failed to get source access contract: ${errorMsg}`,
            status: 'UNAVAILABLE',
            reason_codes: ['NOT_MOUNTED']
        }, null, 2);
    }
}

