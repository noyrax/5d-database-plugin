import { ChangeApi } from '../../api/change-api';
import { MultiDbManager } from '../../core/multi-db-manager';

/**
 * MCP Resource handler for changes (T-Dimension)
 */
export class ChangesResource {
    private changeApi: ChangeApi;

    constructor(dbManager: MultiDbManager) {
        this.changeApi = new ChangeApi(dbManager);
    }

    /**
     * Handles resource URI: db://changes/{id}
     */
    public async handleResource(uri: string): Promise<string> {
        const match = uri.match(/^db:\/\/changes\/(.+)$/);
        if (!match) {
            throw new Error(`Invalid change resource URI: ${uri}`);
        }

        const pluginId = match[1];
        const reports = await this.changeApi.getAllChangeReports(pluginId);
        return JSON.stringify(reports, null, 2);
    }
}

