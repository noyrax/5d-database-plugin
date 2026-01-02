import { MultiDbManager } from '../../core/multi-db-manager';
import { IdMapper } from '../../core/id-mapper';
import { SemanticSearchApi } from '../../api/semantic-search-api';
import { ContextBuilder } from '../../api/context-builder';
import { EmbeddingGenerator } from '../../embedding/embedding-generator';

/**
 * Executes semantic discovery tool.
 * Performs semantic search and returns structured context.
 */
export async function executeSemanticDiscovery(
    args: { query: string; pluginId: string; limit?: number },
    dbManager: MultiDbManager,
    idMapper: IdMapper
): Promise<string> {
    try {
        const embeddingGenerator = new EmbeddingGenerator();
        const semanticSearchApi = new SemanticSearchApi(dbManager, embeddingGenerator);
        const contextBuilder = new ContextBuilder(dbManager, idMapper);

        // 1. Semantic Search
        let results;
        try {
            results = await semanticSearchApi.search(args.query, args.pluginId, {
                limit: args.limit || 10
            });
        } catch (searchError: any) {
            // If semantic search fails, return empty results with error info
            const errorMsg = searchError?.message || String(searchError);
            return JSON.stringify({
                query: args.query,
                results: [],
                context: {},
                error: `Semantic search failed: ${errorMsg}`,
                fallback: 'Semantic search unavailable, returning empty results'
            }, null, 2);
        }

        // 2. Deterministic Context Builder
        let context;
        try {
            context = await contextBuilder.buildContext(
                results.map(r => r.entityRef),
                args.pluginId
            );
        } catch (contextError: any) {
            // If context building fails, return results without context
            const errorMsg = contextError?.message || String(contextError);
            return JSON.stringify({
                query: args.query,
                results: results.map(r => ({
                    dimension: r.dimension,
                    entityId: r.entityId,
                    externalId: r.externalId,
                    score: r.score,
                    vectorScore: r.vectorScore,
                    importanceScore: r.importanceScore
                })),
                context: {},
                warning: `Context building failed: ${errorMsg}`
            }, null, 2);
        }

        // 3. Return structured JSON (no AI generation!)
        return JSON.stringify({
            query: args.query,
            results: results.map(r => ({
                dimension: r.dimension,
                entityId: r.entityId,
                externalId: r.externalId,
                score: r.score,
                vectorScore: r.vectorScore,
                importanceScore: r.importanceScore
            })),
            context
        }, null, 2);
    } catch (error: any) {
        // Catch-all error handler - ensure we always return valid JSON
        const errorMsg = error?.message || String(error);
        const errorStack = error?.stack ? String(error.stack).substring(0, 500) : undefined;
        return JSON.stringify({
            query: args.query,
            results: [],
            context: {},
            error: `Semantic discovery failed: ${errorMsg}`,
            stack: errorStack
        }, null, 2);
    }
}


