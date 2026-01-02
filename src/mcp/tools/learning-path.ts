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
    const embeddingGenerator = new EmbeddingGenerator();
    const semanticSearchApi = new SemanticSearchApi(dbManager, embeddingGenerator);
    const learningPathApi = new LearningPathApi(dbManager, semanticSearchApi);
    
    const path = await learningPathApi.generateLearningPath(args.topic, args.pluginId);
    return JSON.stringify(path, null, 2);
}


