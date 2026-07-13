import * as sqlite3 from 'sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { VssLoader } from './vss-loader';
import { VectorDatabase } from './vector-database-interface';
import { VectorDatabaseFactory } from './vector-database-factory';

/**
 * Dimension types for the 5D database system + 6th dimension (V for vectors)
 */
export type Dimension = 'X' | 'Y' | 'Z' | 'W' | 'T' | 'V';

/**
 * Database file names for each dimension
 */
const DIMENSION_DB_FILES: Record<Dimension, string> = {
    X: 'modules.db',
    Y: 'symbols.db',
    Z: 'dependencies.db',
    W: 'adrs.db',
    T: 'changes.db',
    V: 'vectors.db'
};

/**
 * Manages 5 separate SQLite databases, one for each dimension.
 * Each database is stored in the workspace-specific .database-plugin directory.
 */
export class MultiDbManager {
    private databases: Map<Dimension, sqlite3.Database> = new Map();
    private dbDirectory: string;
    private workspaceRoot: string;
    private pluginId: string;
    private vssLoader: VssLoader;
    private vectorDatabase: VectorDatabase | null = null;

    /**
     * Creates a new MultiDbManager instance.
     * @param workspaceRoot The root directory of the workspace
     */
    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
        this.dbDirectory = path.join(workspaceRoot, '.database-plugin');
        this.pluginId = this.computePluginId(workspaceRoot);
        this.vssLoader = new VssLoader();
        this.ensureDbDirectory();
        this.checkPluginIdConsistency();
    }

    /**
     * Computes a stable plugin_id from the workspace root path.
     * Uses SHA256 hash of normalized path, takes first 16 characters.
     * 
     * Normalization: POSIX-style (forward slashes), lowercase on Windows (case-insensitive).
     * This matches WorkspaceResolver.computePluginId() for consistency.
     * 
     * @param workspaceRoot The workspace root directory
     * @returns Stable plugin ID (16 hex characters)
     */
    private computePluginId(workspaceRoot: string): string {
        // Resolve to absolute path
        const resolved = path.resolve(workspaceRoot);
        
        // Convert to POSIX-style (forward slashes)
        const posix = resolved.replace(/\\/g, '/');
        
        // On Windows, normalize case (to lowercase for case-insensitive comparison)
        // On Unix, preserve case
        const normalizedPath = process.platform === 'win32' ? posix.toLowerCase() : posix;
        
        const hash = crypto.createHash('sha256').update(normalizedPath).digest('hex');
        return hash.substring(0, 16);
    }

    /**
     * Ensures the database directory exists.
     */
    private ensureDbDirectory(): void {
        if (!fs.existsSync(this.dbDirectory)) {
            fs.mkdirSync(this.dbDirectory, { recursive: true });
        }
    }

    /**
     * Checks if existing databases have a different plugin ID (e.g., after workspace move).
     * Returns true if mismatch is detected, false otherwise.
     * 
     * IMPORTANT: This method closes all open database connections before checking,
     * to ensure databases can be deleted if cleanup is needed.
     * 
     * @returns Promise that resolves to true if plugin ID mismatch detected, false otherwise
     */
    public async checkPluginIdMismatch(): Promise<boolean> {
        // Close all open database connections first to avoid lock issues
        await this.closeAll();
        
        if (!fs.existsSync(this.dbDirectory)) {
            return false; // No databases exist yet
        }

        const dbFiles = [
            { file: 'modules.db', table: 'modules' },
            { file: 'symbols.db', table: 'symbols' },
            { file: 'dependencies.db', table: 'dependencies' },
            { file: 'adrs.db', table: 'adrs' },
            { file: 'changes.db', table: 'change_reports' }
        ];

        // Check first available database file
        for (const { file, table } of dbFiles) {
            const dbPath = path.join(this.dbDirectory, file);
            if (!fs.existsSync(dbPath)) {
                continue;
            }

            try {
                const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);
                const hasMismatch = await new Promise<boolean>((resolve) => {
                    db.get(`SELECT plugin_id FROM ${table} LIMIT 1`, (err: Error | null, row: any) => {
                        if (!err && row && row.plugin_id && row.plugin_id !== this.pluginId) {
                            resolve(true);
                        } else {
                            resolve(false);
                        }
                    });
                });
                db.close((err) => {
                    // Ignore close errors
                });
                
                if (hasMismatch) {
                    return true;
                }
                
                // Only check first available database to avoid too many checks
                break;
            } catch (error) {
                // Ignore errors - database might be locked, corrupted, or table might not exist
                continue;
            }
        }
        
        return false;
    }

    /**
     * Checks if existing databases have a different plugin ID (e.g., after workspace move).
     * This is informational only and does not block operation.
     * Note: This is a best-effort check and may not catch all cases.
     */
    private checkPluginIdConsistency(): void {
        if (!fs.existsSync(this.dbDirectory)) {
            return; // No databases exist yet
        }

        const dbFiles = [
            { file: 'modules.db', table: 'modules' },
            { file: 'symbols.db', table: 'symbols' },
            { file: 'dependencies.db', table: 'dependencies' },
            { file: 'adrs.db', table: 'adrs' },
            { file: 'changes.db', table: 'change_reports' }
        ];

        // Check first available database file
        for (const { file, table } of dbFiles) {
            const dbPath = path.join(this.dbDirectory, file);
            if (!fs.existsSync(dbPath)) {
                continue;
            }

            try {
                // Synchronous check - try to read first row if possible
                // This is a best-effort check, so we use a simple approach
                const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);
                
                db.get(`SELECT plugin_id FROM ${table} LIMIT 1`, (err: Error | null, row: any) => {
                    if (!err && row && row.plugin_id && row.plugin_id !== this.pluginId) {
                        console.warn(`[MultiDbManager] WARNING: Found existing database (${file}) with different plugin ID (${row.plugin_id}).`);
                        console.warn(`[MultiDbManager] Current plugin ID: ${this.pluginId}`);
                        console.warn(`[MultiDbManager] This may indicate the workspace was moved or renamed.`);
                        console.warn(`[MultiDbManager] Old data will not be accessible. Consider running full ingestion with --cleanup flag.`);
                    }
                    db.close();
                });
                
                // Only check first available database to avoid too many warnings
                break;
            } catch (error) {
                // Ignore errors - database might be locked, corrupted, or table might not exist
                continue;
            }
        }
    }

    /**
     * Cleans up old databases with different plugin IDs.
     * Closes all open database connections, then deletes all database files.
     * 
     * WARNING: This will permanently delete all existing database data.
     * Use only when you want to start fresh after workspace move/rename.
     * 
     * Note: If databases are locked by another process (e.g., VS Code Extension),
     * deletion will fail with a warning. The new ingestion will overwrite old data anyway.
     * 
     * @returns Promise that resolves when cleanup is complete
     */
    public async cleanupOldDatabases(): Promise<void> {
        console.log(`[MultiDbManager] Cleaning up old databases with different plugin ID...`);
        console.log(`[MultiDbManager] Current plugin ID: ${this.pluginId}`);
        
        // Close all open database connections first
        await this.closeAll();
        
        // Wait a bit to ensure file handles are released
        await new Promise(resolve => setTimeout(resolve, 100));
        
        if (!fs.existsSync(this.dbDirectory)) {
            console.log(`[MultiDbManager] No database directory found, nothing to clean up.`);
            return;
        }

        const dbFiles = [
            'modules.db',
            'symbols.db',
            'dependencies.db',
            'adrs.db',
            'changes.db',
            'vectors.db'
        ];

        let deletedCount = 0;
        let failedCount = 0;
        for (const file of dbFiles) {
            const dbPath = path.join(this.dbDirectory, file);
            if (fs.existsSync(dbPath)) {
                try {
                    // Try to close any open connections to this file first
                    // (in case it was opened by checkPluginIdMismatch)
                    fs.unlinkSync(dbPath);
                    console.log(`[MultiDbManager] Deleted: ${file}`);
                    deletedCount++;
                } catch (error: any) {
                    if (error.code === 'EBUSY' || error.code === 'ENOENT') {
                        // File is locked or already deleted - this is OK, new ingestion will overwrite
                        console.warn(`[MultiDbManager] Could not delete ${file} (locked or already deleted). New ingestion will overwrite old data.`);
                    } else {
                        console.warn(`[MultiDbManager] Failed to delete ${file}: ${error.message}`);
                    }
                    failedCount++;
                }
            }
        }

        // Also try to delete any migration-related files
        const migrationFiles = ['migrations.db', 'migration_history.db'];
        for (const file of migrationFiles) {
            const filePath = path.join(this.dbDirectory, file);
            if (fs.existsSync(filePath)) {
                try {
                    fs.unlinkSync(filePath);
                    console.log(`[MultiDbManager] Deleted: ${file}`);
                } catch (error: any) {
                    // Ignore errors for migration files
                }
            }
        }

        if (deletedCount > 0) {
            console.log(`[MultiDbManager] Cleanup complete: ${deletedCount} database file(s) deleted.`);
        }
        if (failedCount > 0) {
            console.log(`[MultiDbManager] Note: ${failedCount} file(s) could not be deleted (may be locked by another process). New ingestion will overwrite old data.`);
        }
    }

    /**
     * Gets the plugin ID for this workspace.
     */
    public getPluginId(): string {
        return this.pluginId;
    }

    /**
     * Gets the database directory path.
     */
    public getDbDirectory(): string {
        return this.dbDirectory;
    }

    /**
     * Gets the workspace root directory.
     */
    public getWorkspaceRoot(): string {
        return this.workspaceRoot;
    }

    /**
     * Opens a database connection for the specified dimension.
     * If the database is already open, returns the existing connection.
     * For V-dimension (vectors.db), loads VSS extension before opening.
     * 
     * @param dimension The dimension (X, Y, Z, W, T, or V)
     * @returns Promise that resolves to the SQLite database instance
     */
    public async getDatabase(dimension: Dimension): Promise<sqlite3.Database> {
        if (this.databases.has(dimension)) {
            return this.databases.get(dimension)!;
        }

        const dbPath = path.join(this.dbDirectory, DIMENSION_DB_FILES[dimension]);
        
        return new Promise((resolve, reject) => {
            const db = new sqlite3.Database(dbPath, async (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                // Initialize vector database for V-dimension
                if (dimension === 'V') {
                    try {
                        await this.vssLoader.loadExtension(db);
                        // Create vector database instance (VSS on macOS/Linux, ChromaDB on Windows)
                        if (!this.vectorDatabase) {
                            this.vectorDatabase = await VectorDatabaseFactory.create(db, this.vssLoader, this.workspaceRoot);
                        }
                    } catch (vssError) {
                        // VSS loading failed, but continue without it (will use ChromaDB or fallback)
                        console.warn(`[MultiDbManager] VSS extension loading failed for V-dimension: ${vssError}`);
                        // Still create vector database (ChromaDB on Windows, or fallback)
                        if (!this.vectorDatabase) {
                            this.vectorDatabase = await VectorDatabaseFactory.create(db, this.vssLoader, this.workspaceRoot);
                        }
                    }
                }
                
                this.databases.set(dimension, db);
                resolve(db);
            });
        });
    }

    /**
     * Closes a database connection for the specified dimension.
     * 
     * @param dimension The dimension to close
     * @returns Promise that resolves when the database is closed
     */
    public async closeDatabase(dimension: Dimension): Promise<void> {
        const db = this.databases.get(dimension);
        if (db) {
            return new Promise((resolve, reject) => {
                db.close((err) => {
                    if (err) {
                        reject(err);
                    } else {
                        this.databases.delete(dimension);
                        resolve();
                    }
                });
            });
        }
    }

    /**
     * Closes all database connections.
     * 
     * @returns Promise that resolves when all databases are closed
     */
    public async closeAll(): Promise<void> {
        const closePromises: Promise<void>[] = [];
        for (const dimension of this.databases.keys()) {
            closePromises.push(this.closeDatabase(dimension));
        }
        await Promise.all(closePromises);
    }

    /**
     * Gets all open database connections.
     * 
     * @returns Map of dimension to database instance
     */
    public getOpenDatabases(): Map<Dimension, sqlite3.Database> {
        return new Map(this.databases);
    }

    /**
     * Gets the Vector Database for vector similarity search.
     * Only available for V-dimension after initialization.
     * 
     * @returns Vector Database instance or null if not available
     */
    public getVectorDatabase(): VectorDatabase | null {
        return this.vectorDatabase;
    }

    /**
     * @deprecated Use getVectorDatabase() instead
     * Gets the VSS Manager for backward compatibility.
     */
    public getVssManager(): any | null {
        return this.vectorDatabase;
    }
}

