import { CrossDimensionApi } from '../../api/cross-dimension-api';
import { MultiDbManager } from '../../core/multi-db-manager';
import { IdMapper } from '../../core/id-mapper';

/**
 * MCP Tool: cross_analysis
 * Performs cross-dimension analysis
 */
export class CrossAnalysisTool {
    private crossDimensionApi: CrossDimensionApi;

    constructor(dbManager: MultiDbManager, idMapper: IdMapper) {
        this.crossDimensionApi = new CrossDimensionApi(dbManager, idMapper);
    }

    /**
     * Executes the cross_analysis tool.
     */
    public async execute(args: { filePath: string; pluginId: string }): Promise<string> {
        const adrs = await this.crossDimensionApi.getAdrsForFilePath(args.filePath, args.pluginId);
        const symbols = await this.crossDimensionApi.getSymbolsForModule(args.filePath, args.pluginId);
        return JSON.stringify({ adrs, symbols }, null, 2);
    }
}

