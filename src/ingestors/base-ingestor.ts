import { Dimension } from '../core/multi-db-manager';

/**
 * Base interface for all ingestion modules.
 * Each dimension has its own ingestor that reads from specific documentation files.
 */
export interface BaseIngestor {
    /**
     * Gets the dimension this ingestor handles.
     */
    getDimension(): Dimension;

    /**
     * Performs a full ingestion of all data for this dimension.
     * 
     * @param workspaceRoot The workspace root directory
     * @param pluginId The plugin ID
     * @param docsPath The path to the docs directory
     * @returns Promise that resolves when ingestion is complete
     */
    ingestFull(workspaceRoot: string, pluginId: string, docsPath: string): Promise<void>;

    /**
     * Performs an incremental ingestion, only processing changed files.
     * 
     * @param workspaceRoot The workspace root directory
     * @param pluginId The plugin ID
     * @param docsPath The path to the docs directory
     * @returns Promise that resolves when ingestion is complete
     */
    ingestIncremental(workspaceRoot: string, pluginId: string, docsPath: string): Promise<void>;
}

