import { VoyageAIClient } from 'voyageai';

/**
 * Generates embeddings for entities across all 5 dimensions.
 * Uses Voyage AI voyage-3.5 model (1024 dimensions).
 *
 * Voyage AI is Anthropic's recommended embedding provider (Anthropic does not
 * offer its own embedding API). Configure via the VOYAGE_API_KEY environment
 * variable, or override the model via VOYAGE_MODEL.
 */
export class EmbeddingGenerator {
    private client: VoyageAIClient | null = null;
    private readonly model: string = process.env.VOYAGE_MODEL || 'voyage-3.5';
    private readonly dimensions: number = 1024;

    constructor(apiKey?: string) {
        const key = apiKey || process.env.VOYAGE_API_KEY;
        if (key) {
            this.client = new VoyageAIClient({ apiKey: key });
        } else {
            console.warn('[EmbeddingGenerator] Voyage API key not provided. Set VOYAGE_API_KEY. Embedding generation will not work.');
        }
    }

    /**
     * Generates an embedding for a single entity.
     *
     * @param dimension The dimension (X, Y, Z, W, or T)
     * @param entityId The entity ID (for logging)
     * @param content The content to embed
     * @returns Promise that resolves to the embedding vector (1024 dimensions)
     * @throws Error if the Voyage API is not configured or the API call fails
     */
    async generateEmbedding(
        dimension: 'X' | 'Y' | 'Z' | 'W' | 'T',
        entityId: string,
        content: string
    ): Promise<number[]> {
        if (!this.client) {
            throw new Error('Voyage API key not configured. Set VOYAGE_API_KEY environment variable.');
        }

        if (!content || content.trim().length === 0) {
            throw new Error(`Empty content for entity ${entityId} in dimension ${dimension}`);
        }

        try {
            const response = await this.client.embed({
                input: content,
                model: this.model,
                outputDimension: this.dimensions
            });

            const embedding = response.data?.[0]?.embedding;
            if (!embedding || embedding.length === 0) {
                throw new Error(`No embedding returned for entity ${entityId}`);
            }

            return embedding;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to generate embedding for entity ${entityId} in dimension ${dimension}: ${errorMessage}`);
        }
    }

    /**
     * Generates embeddings for multiple entities in batch.
     * Uses the Voyage AI batch embedding endpoint for better performance.
     *
     * @param items Array of items to embed
     * @returns Promise that resolves to a Map of entityId -> embedding vector
     */
    async generateBatch(
        items: Array<{ dimension: 'X' | 'Y' | 'Z' | 'W' | 'T'; entityId: string; content: string }>
    ): Promise<Map<string, number[]>> {
        if (!this.client) {
            throw new Error('Voyage API key not configured. Set VOYAGE_API_KEY environment variable.');
        }

        if (items.length === 0) {
            return new Map();
        }

        // Filter out empty content
        const validItems = items.filter(item => item.content && item.content.trim().length > 0);

        if (validItems.length === 0) {
            return new Map();
        }

        const results = new Map<string, number[]>();

        // Voyage embeddings API supports up to 1000 inputs per request.
        // We process in batches of 100 for safety (per-request token limits also apply).
        const batchSize = 100;

        for (let i = 0; i < validItems.length; i += batchSize) {
            const batch = validItems.slice(i, i + batchSize);

            try {
                const inputs = batch.map(item => item.content);
                const response = await this.client.embed({
                    input: inputs,
                    model: this.model,
                    outputDimension: this.dimensions
                });

                const data = response.data;
                if (!data || data.length !== batch.length) {
                    throw new Error(`Mismatch: expected ${batch.length} embeddings, got ${data?.length || 0}`);
                }

                // Map results back to entity IDs (Voyage preserves input order)
                for (let j = 0; j < batch.length; j++) {
                    const embedding = data[j].embedding;
                    if (!embedding || embedding.length === 0) {
                        console.error(`[EmbeddingGenerator] Empty embedding for ${batch[j].entityId}`);
                        continue;
                    }
                    results.set(batch[j].entityId, embedding);
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error(`[EmbeddingGenerator] Batch embedding failed for batch ${i / batchSize + 1}: ${errorMessage}`);

                // Fallback: Try individual embeddings for this batch
                for (const item of batch) {
                    try {
                        const embedding = await this.generateEmbedding(item.dimension, item.entityId, item.content);
                        results.set(item.entityId, embedding);
                    } catch (individualError) {
                        console.error(`[EmbeddingGenerator] Failed to generate embedding for ${item.entityId}: ${individualError}`);
                        // Continue with other items
                    }
                }
            }
        }

        return results;
    }

    /**
     * Gets the embedding model name.
     */
    getModel(): string {
        return this.model;
    }

    /**
     * Gets the embedding dimensions.
     */
    getDimensions(): number {
        return this.dimensions;
    }

    /**
     * Checks if the Voyage API is configured.
     */
    isConfigured(): boolean {
        return this.client !== null;
    }
}
