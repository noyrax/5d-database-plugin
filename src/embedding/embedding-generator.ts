import OpenAI from 'openai';

/**
 * Generates embeddings for entities across all 5 dimensions.
 * Uses OpenAI text-embedding-3-small model (1536 dimensions).
 */
export class EmbeddingGenerator {
    private openai: OpenAI | null = null;
    private readonly model: string = 'text-embedding-3-small';
    private readonly dimensions: number = 1536;

    constructor(apiKey?: string) {
        if (apiKey) {
            this.openai = new OpenAI({ apiKey });
        } else {
            // Try to get from environment variable
            const envKey = process.env.OPENAI_API_KEY;
            if (envKey) {
                this.openai = new OpenAI({ apiKey: envKey });
            } else {
                console.warn('[EmbeddingGenerator] OpenAI API key not provided. Embedding generation will not work.');
            }
        }
    }

    /**
     * Generates an embedding for a single entity.
     * 
     * @param dimension The dimension (X, Y, Z, W, or T)
     * @param entityId The entity ID (for logging)
     * @param content The content to embed
     * @returns Promise that resolves to the embedding vector (1536 dimensions)
     * @throws Error if OpenAI API is not configured or API call fails
     */
    async generateEmbedding(
        dimension: 'X' | 'Y' | 'Z' | 'W' | 'T',
        entityId: string,
        content: string
    ): Promise<number[]> {
        if (!this.openai) {
            throw new Error('OpenAI API key not configured. Set OPENAI_API_KEY environment variable.');
        }

        if (!content || content.trim().length === 0) {
            throw new Error(`Empty content for entity ${entityId} in dimension ${dimension}`);
        }

        try {
            const response = await this.openai.embeddings.create({
                model: this.model,
                input: content,
                dimensions: this.dimensions
            });

            if (!response.data || response.data.length === 0) {
                throw new Error(`No embedding returned for entity ${entityId}`);
            }

            return response.data[0].embedding;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to generate embedding for entity ${entityId} in dimension ${dimension}: ${errorMessage}`);
        }
    }

    /**
     * Generates embeddings for multiple entities in batch.
     * Uses OpenAI batch API for better performance.
     * 
     * @param items Array of items to embed
     * @returns Promise that resolves to a Map of entityId -> embedding vector
     */
    async generateBatch(
        items: Array<{ dimension: 'X' | 'Y' | 'Z' | 'W' | 'T'; entityId: string; content: string }>
    ): Promise<Map<string, number[]>> {
        if (!this.openai) {
            throw new Error('OpenAI API key not configured. Set OPENAI_API_KEY environment variable.');
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

        // OpenAI embeddings API supports up to 2048 inputs per request
        // We'll process in batches of 100 for safety
        const batchSize = 100;
        
        for (let i = 0; i < validItems.length; i += batchSize) {
            const batch = validItems.slice(i, i + batchSize);
            
            try {
                const inputs = batch.map(item => item.content);
                const response = await this.openai.embeddings.create({
                    model: this.model,
                    input: inputs,
                    dimensions: this.dimensions
                });

                if (!response.data || response.data.length !== batch.length) {
                    throw new Error(`Mismatch: expected ${batch.length} embeddings, got ${response.data?.length || 0}`);
                }

                // Map results back to entity IDs
                for (let j = 0; j < batch.length; j++) {
                    const item = batch[j];
                    const embedding = response.data[j].embedding;
                    results.set(item.entityId, embedding);
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
     * Checks if OpenAI API is configured.
     */
    isConfigured(): boolean {
        return this.openai !== null;
    }
}


