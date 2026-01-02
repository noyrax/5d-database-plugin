import { MultiDbManager } from '../../core/multi-db-manager';
import { SelfExplanationApi } from '../../api/self-explanation-api';

/**
 * Executes system explanation tool.
 * Returns system overview, entry points, and architecture ADRs.
 */
export async function executeSystemExplanation(
    args: { pluginId: string },
    dbManager: MultiDbManager
): Promise<string> {
    const selfExplanationApi = new SelfExplanationApi(dbManager);
    const explanation = await selfExplanationApi.explainSystem(args.pluginId);
    return JSON.stringify(explanation, null, 2);
}


