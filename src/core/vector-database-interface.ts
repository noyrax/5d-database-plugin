/**
 * Interface for vector database operations.
 * Abstracts VSS and external vector databases (e.g., ChromaDB).
 */
export interface VectorDatabase {
    /**
     * Checks if the vector database is available and ready to use.
     * 
     * @returns true if available, false otherwise
     */
    isAvailable(): boolean;

    /**
     * Initializes the vector database.
     * Must be called before using other methods.
     * 
     * @returns Promise that resolves when initialization is complete
     */
    initialize(): Promise<void>;

    /**
     * Upserts (inserts or updates) an embedding vector.
     * 
     * @param embeddingId The unique identifier for the embedding
     * @param embeddingVector The embedding vector (1536 dimensions)
     * @returns Promise that resolves when the embedding is upserted
     */
    upsertEmbedding(embeddingId: string, embeddingVector: Float32Array | number[]): Promise<void>;

    /**
     * Searches for similar embeddings using vector similarity search.
     * 
     * @param queryEmbedding The query embedding vector
     * @param limit Maximum number of results to return
     * @param dimension Optional: Filter by dimension (X, Y, Z, W, T)
     * @param pluginId Optional: Filter by plugin ID
     * @returns Promise that resolves to an array of search results with rowid and distance/similarity score
     */
    search(
        queryEmbedding: Float32Array | number[],
        limit: number,
        dimension?: 'X' | 'Y' | 'Z' | 'W' | 'T',
        pluginId?: string
    ): Promise<Array<{ rowid: number; distance: number; similarity?: number }>>;

    /**
     * Gets the embedding ID from a rowid.
     * This is needed for mapping VSS rowids back to embedding IDs.
     * 
     * @param rowid The rowid from the search result
     * @returns Promise that resolves to the embedding ID, or null if not found
     */
    getEmbeddingIdFromRowid(rowid: number): Promise<string | null>;
}

