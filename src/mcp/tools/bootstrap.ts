import { MultiDbManager } from '../../core/multi-db-manager';
import { BootstrapApi } from '../../api/bootstrap-api';

/**
 * Executes bootstrap tool.
 * Returns bootstrap information for first-time system understanding.
 */
export async function executeBootstrap(
    args: { pluginId: string },
    dbManager: MultiDbManager
): Promise<string> {
    const bootstrapApi = new BootstrapApi(dbManager);
    const bootstrap = await bootstrapApi.getBootstrapInfo(args.pluginId);
    return JSON.stringify(bootstrap, null, 2);
}


