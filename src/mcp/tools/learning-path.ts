import { MultiDbManager } from '../../core/multi-db-manager';
import { SemanticSearchApi } from '../../api/semantic-search-api';
import { LearningPathApi } from '../../api/learning-path-api';
import { EmbeddingGenerator } from '../../embedding/embedding-generator';

/**
 * Executes learning path tool.
 * Generates guided learning path for understanding a topic.
 */
export async function executeLearningPath(
    args: { topic: string; pluginId: string },
    dbManager: MultiDbManager
): Promise<string> {
    try {
        const embeddingGenerator = new EmbeddingGenerator();
        const semanticSearchApi = new SemanticSearchApi(dbManager, embeddingGenerator);
        const learningPathApi = new LearningPathApi(dbManager, semanticSearchApi);
        
        const path = await learningPathApi.generateLearningPath(args.topic, args.pluginId);
        return JSON.stringify(path, null, 2);
    } catch (error: any) {
        // Catch-all error handler - ensure we always return valid JSON
        const errorMsg = error?.message || String(error);
        const errorStack = error?.stack ? String(error.stack).substring(0, 500) : undefined;
        return JSON.stringify({
            topic: args.topic,
            path: [],
            estimated_time: '0 minutes',
            error: `Learning path generation failed: ${errorMsg}`,
            stack: errorStack
        }, null, 2);
    }
}


