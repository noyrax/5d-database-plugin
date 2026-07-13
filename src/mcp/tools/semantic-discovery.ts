import { MultiDbManager } from '../../core/multi-db-manager';
import { IdMapper } from '../../core/id-mapper';
import { SemanticSearchApi } from '../../api/semantic-search-api';
import { ContextBuilder } from '../../api/context-builder';
import { EmbeddingGenerator } from '../../embedding/embedding-generator';
import { VectorBackendStatusApi } from '../../api/vector-backend-status-api';
import { ReasonCode } from '../../models/reason-codes';

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
        let fallbackMode = false;
        let reasonCode: ReasonCode | undefined = undefined;
        
        try {
            results = await semanticSearchApi.search(args.query, args.pluginId, {
                limit: args.limit || 10
            });
        } catch (searchError: any) {
            // If semantic search fails, check vector backend status to determine reason code
            fallbackMode = true;
            try {
                const vectorBackendStatusApi = new VectorBackendStatusApi(dbManager);
                const status = await vectorBackendStatusApi.getVectorBackendStatus();
                reasonCode = status.reason_code;
            } catch (statusError) {
                // If status check fails, use generic reason code
                reasonCode = ReasonCode.VECTOR_BACKEND_UNREACHABLE;
            }
            
            // If vector backend is not available, return fallback response
            const errorMsg = searchError?.message || String(searchError);
            return JSON.stringify({
                query: args.query,
                results: [],
                context: {},
                mode: 'fallback',
                reason_code: reasonCode || ReasonCode.VECTOR_BACKEND_UNREACHABLE,
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

        // 3. Check if fallback mode was used (cosine similarity instead of vector database)
        // Note: We can't directly detect this from results, but we can check vector backend status
        // If vector backend is not available but we got results, we're in fallback mode
        try {
            const vectorBackendStatusApi = new VectorBackendStatusApi(dbManager);
            const status = await vectorBackendStatusApi.getVectorBackendStatus();
            if (status.fallback && results.length > 0) {
                fallbackMode = true;
                reasonCode = status.reason_code;
            }
        } catch (statusError) {
            // Ignore status check errors
        }

        // 4. Return structured JSON (no AI generation!)
        const response: any = {
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
        };

        // Add fallback signaling if in fallback mode
        if (fallbackMode && reasonCode) {
            response.mode = 'fallback';
            response.reason_code = reasonCode;
        } else {
            response.mode = 'normal';
        }

        return JSON.stringify(response, null, 2);
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


