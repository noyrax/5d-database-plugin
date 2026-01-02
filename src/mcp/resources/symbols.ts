import { SymbolApi } from '../../api/symbol-api';
import { MultiDbManager } from '../../core/multi-db-manager';

/**
 * MCP Resource handler for symbols (Y-Dimension)
 */
export class SymbolsResource {
    private symbolApi: SymbolApi;

    constructor(dbManager: MultiDbManager) {
        this.symbolApi = new SymbolApi(dbManager);
    }

    /**
     * Handles resource URI: db://symbols/{id}
     */
    public async handleResource(uri: string): Promise<string> {
        const match = uri.match(/^db:\/\/symbols\/(.+)$/);
        if (!match) {
            throw new Error(`Invalid symbol resource URI: ${uri}`);
        }

        const pluginId = match[1];
        const symbols = await this.symbolApi.getAllSymbols(pluginId);
        return JSON.stringify(symbols, null, 2);
    }
}

