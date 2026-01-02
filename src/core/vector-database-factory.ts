import * as sqlite3 from 'sqlite3';
import * as path from 'path';
import { VssLoader } from './vss-loader';
import { VssVectorDatabase } from './vss-vector-database';
import { ChromaDbVectorDatabase } from './chromadb-vector-database';
import { VectorDatabase } from './vector-database-interface';

/**
 * Factory for creating vector database instances based on platform.
 * Selects the appropriate implementation (VSS on macOS/Linux, ChromaDB on Windows).
 */
export class VectorDatabaseFactory {
    /**
     * Creates a vector database instance for the given database.
     * 
     * @param db The SQLite database instance
     * @param vssLoader The VSS loader instance
     * @param workspaceRoot The workspace root directory (for ChromaDB path)
     * @returns Promise that resolves to a VectorDatabase instance
     */
    static async create(db: sqlite3.Database, vssLoader: VssLoader, workspaceRoot: string): Promise<VectorDatabase> {
        const platform = process.platform;
        const arch = process.arch;

        // macOS and Linux: Use VSS
        if (platform === 'darwin' || platform === 'linux') {
            const vssDb = new VssVectorDatabase(db, vssLoader);
            
            // Try to initialize VSS
            try {
                await vssDb.initialize();
                if (vssDb.isAvailable()) {
                    // Removed console.log to prevent stdout interference with MCP JSON-RPC protocol
                    return vssDb;
                }
            } catch (error) {
                // Removed console.warn to prevent stdout interference with MCP JSON-RPC protocol
            }
        }

        // Windows: Use ChromaDB
        if (platform === 'win32') {
            const chromaDb = new ChromaDbVectorDatabase(db, workspaceRoot);
            
            try {
                await chromaDb.initialize();
                if (chromaDb.isAvailable()) {
                    // Removed console.log to prevent stdout interference with MCP JSON-RPC protocol
                    return chromaDb;
                }
            } catch (error) {
                // Removed console.warn to prevent stdout interference with MCP JSON-RPC protocol
            }
        }

        // Fallback: Use VSS (will fallback to cosine similarity if VSS not available)
        // Removed console.warn to prevent stdout interference with MCP JSON-RPC protocol
        const vssDb = new VssVectorDatabase(db, vssLoader);
        await vssDb.initialize(); // Will fail gracefully on Windows
        return vssDb;
    }

    /**
     * Checks if a platform-specific vector database is available.
     * 
     * @returns true if an optimized vector database is available for the current platform
     */
    static isOptimizedDatabaseAvailable(): boolean {
        const platform = process.platform;
        
        // VSS is available on macOS and Linux
        if (platform === 'darwin' || platform === 'linux') {
            return true;
        }

        // ChromaDB is available on Windows (if installed)
        if (platform === 'win32') {
            try {
                require('chromadb');
                return true;
            } catch {
                return false;
            }
        }

        return false;
    }
}

