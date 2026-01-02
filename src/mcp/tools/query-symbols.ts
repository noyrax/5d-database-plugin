import { SymbolApi } from '../../api/symbol-api';
import { MultiDbManager } from '../../core/multi-db-manager';

/**
 * MCP Tool: query_symbols
 * Queries symbols by path or symbol ID
 */
export class QuerySymbolsTool {
    private symbolApi: SymbolApi;

    constructor(dbManager: MultiDbManager) {
        this.symbolApi = new SymbolApi(dbManager);
    }

    /**
     * Executes the query_symbols tool.
     */
    public async execute(args: { path?: string; symbolId?: string; pluginId: string }): Promise<string> {
        let symbols;
        if (args.symbolId) {
            const symbol = await this.symbolApi.getSymbolById(args.symbolId, args.pluginId);
            symbols = symbol ? [symbol] : [];
        } else if (args.path) {
            symbols = await this.symbolApi.getSymbolsByPath(args.path, args.pluginId);
        } else {
            symbols = await this.symbolApi.getAllSymbols(args.pluginId);
        }
        return JSON.stringify(symbols, null, 2);
    }
}

