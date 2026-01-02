import { AdrApi } from '../../api/adr-api';
import { MultiDbManager } from '../../core/multi-db-manager';

/**
 * MCP Resource handler for ADRs (W-Dimension)
 */
export class AdrsResource {
    private adrApi: AdrApi;

    constructor(dbManager: MultiDbManager) {
        this.adrApi = new AdrApi(dbManager);
    }

    /**
     * Handles resource URI: db://adrs/{id}
     */
    public async handleResource(uri: string): Promise<string> {
        const match = uri.match(/^db:\/\/adrs\/(.+)$/);
        if (!match) {
            throw new Error(`Invalid ADR resource URI: ${uri}`);
        }

        const pluginId = match[1];
        const adrs = await this.adrApi.getAllAdrs(pluginId);
        return JSON.stringify(adrs, null, 2);
    }
}

