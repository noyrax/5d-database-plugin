import * as sqlite3 from 'sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { MultiDbManager, Dimension } from './multi-db-manager';

/**
 * Migration record stored in each database
 */
interface MigrationRecord {
    version: number;
    name: string;
    applied_at: string;
}

/**
 * Manages database schema migrations for all 5 dimensions.
 * Migrations are stored in the schemas/sqlite/ directory.
 */
export class MigrationManager {
    private dbManager: MultiDbManager;
    private migrationsDirectory: string;

    /**
     * Creates a new MigrationManager instance.
     * 
     * @param dbManager The MultiDbManager instance
     * @param pluginRoot The root directory of the plugin (where schemas/ is located)
     */
    constructor(dbManager: MultiDbManager, pluginRoot: string) {
        this.dbManager = dbManager;
        this.migrationsDirectory = path.join(pluginRoot, 'schemas', 'sqlite');
    }

    /**
     * Checks if the migrations table has the correct structure (composite PRIMARY KEY).
     * 
     * @param db The SQLite database instance
     * @returns Promise that resolves to true if structure is correct, false otherwise
     */
    private async checkMigrationsTableStructure(db: sqlite3.Database): Promise<boolean> {
        return new Promise((resolve, reject) => {
            // Check if table exists
            db.get(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'",
                (err, row: any) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    if (!row) {
                        // Table doesn't exist - structure is "correct" (will be created correctly)
                        resolve(true);
                        return;
                    }
                    
                    // Table exists - check structure by trying to insert a test record
                    // If it fails with UNIQUE constraint on version only, structure is old
                    db.run(
                        'INSERT INTO migrations (version, name) VALUES (?, ?)',
                        [-999999, '__structure_check__'],
                        (insertErr) => {
                            if (insertErr) {
                                // Check if it's a UNIQUE constraint error on version only
                                if (insertErr.message.includes('UNIQUE constraint failed: migrations.version')) {
                                    // Old structure (version only as PRIMARY KEY)
                                    resolve(false);
                                } else {
                                    // Other error - assume structure is correct
                                    resolve(true);
                                }
                            } else {
                                // Insert succeeded - delete test record and check structure
                                db.run(
                                    'DELETE FROM migrations WHERE version = ? AND name = ?',
                                    [-999999, '__structure_check__'],
                                    () => {
                                        // If we got here, structure is correct (composite PRIMARY KEY)
                                        resolve(true);
                                    }
                                );
                            }
                        }
                    );
                }
            );
        });
    }

    /**
     * Ensures the migrations table exists in a database with the correct structure.
     * If the table exists with the old structure (version only as PRIMARY KEY),
     * it will be dropped and recreated with the new structure.
     * 
     * @param db The SQLite database instance
     * @returns Promise that resolves when the table is created/updated
     */
    private async ensureMigrationsTable(db: sqlite3.Database): Promise<void> {
        // Check if table structure is correct
        const structureCorrect = await this.checkMigrationsTableStructure(db);
        
        if (!structureCorrect) {
            // Table exists with old structure - drop and recreate
            console.warn('[MigrationManager] Migrations table has old structure. Recreating with new structure...');
            return new Promise((resolve, reject) => {
                db.run('DROP TABLE IF EXISTS migrations', (dropErr) => {
                    if (dropErr) {
                        reject(dropErr);
                        return;
                    }
                    
                    // Create table with new structure
                    db.run(`
                        CREATE TABLE migrations (
                            version INTEGER NOT NULL,
                            name TEXT NOT NULL,
                            applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            PRIMARY KEY (version, name)
                        )
                    `, (createErr) => {
                        if (createErr) {
                            reject(createErr);
                        } else {
                            resolve();
                        }
                    });
                });
            });
        }
        
        // Table doesn't exist or has correct structure - create if not exists
        return new Promise((resolve, reject) => {
            db.run(`
                CREATE TABLE IF NOT EXISTS migrations (
                    version INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (version, name)
                )
            `, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * Gets the list of applied migrations for a database.
     * 
     * @param db The SQLite database instance
     * @returns Promise that resolves to an array of migration records
     */
    private async getAppliedMigrations(db: sqlite3.Database): Promise<MigrationRecord[]> {
        await this.ensureMigrationsTable(db);
        
        return new Promise((resolve, reject) => {
            db.all('SELECT version, name, applied_at FROM migrations ORDER BY version', (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows as MigrationRecord[]);
                }
            });
        });
    }

    /**
     * Checks if a migration version already exists in the database.
     * 
     * @param db The SQLite database instance
     * @param version The migration version number
     * @returns Promise that resolves to true if the migration exists, false otherwise
     */
    /**
     * Checks if a specific migration (version + name) already exists in the database.
     * 
     * @param db The SQLite database instance
     * @param version The migration version number
     * @param name The migration name
     * @returns Promise that resolves to true if the migration exists, false otherwise
     */
    private async checkMigrationExists(db: sqlite3.Database, version: number, name: string): Promise<boolean> {
        await this.ensureMigrationsTable(db);
        
        return new Promise((resolve, reject) => {
            db.get('SELECT COUNT(*) as count FROM migrations WHERE version = ? AND name = ?', [version, name], (err, row: any) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row && row.count > 0);
                }
            });
        });
    }

    /**
     * Reads a migration file from disk.
     * 
     * @param migrationFile The migration file name (e.g., "001_initial_modules.sql")
     * @returns The SQL content of the migration file
     */
    private readMigrationFile(migrationFile: string): string {
        const filePath = path.join(this.migrationsDirectory, migrationFile);
        if (!fs.existsSync(filePath)) {
            throw new Error(`Migration file not found: ${filePath}`);
        }
        return fs.readFileSync(filePath, 'utf-8');
    }

    /**
     * Applies a migration to a database.
     * 
     * @param db The SQLite database instance
     * @param version The migration version number
     * @param name The migration name
     * @param sql The SQL content to execute
     * @returns Promise that resolves when the migration is applied
     */
    private async applyMigration(db: sqlite3.Database, version: number, name: string, sql: string): Promise<void> {
        // Ensure migrations table has correct structure
        await this.ensureMigrationsTable(db);
        
        return new Promise((resolve, reject) => {
            db.exec(sql, (err) => {
                if (err) {
                    reject(new Error(`Failed to apply migration ${version}_${name}: ${err.message}`));
                } else {
                    // Use INSERT OR IGNORE to handle race conditions
                    // If migration already exists, it will be silently ignored
                    db.run(
                        'INSERT OR IGNORE INTO migrations (version, name) VALUES (?, ?)',
                        [version, name],
                        (insertErr) => {
                            if (insertErr) {
                                // If it's a UNIQUE constraint error, migration already exists - that's OK
                                if (insertErr.message.includes('UNIQUE constraint')) {
                                    console.log(`[MigrationManager] Migration ${version}_${name} already exists, skipping insert`);
                                    resolve();
                                } else {
                                    reject(insertErr);
                                }
                            } else {
                                resolve();
                            }
                        }
                    );
                }
            });
        });
    }

    /**
     * Gets all migration files for a dimension, sorted by version.
     * 
     * @param dimension The dimension
     * @returns Array of migration file names
     */
    private getMigrationFilesForDimension(dimension: Dimension): string[] {
        if (!fs.existsSync(this.migrationsDirectory)) {
            return [];
        }

        const files = fs.readdirSync(this.migrationsDirectory)
            .filter(file => file.endsWith('.sql'))
            .filter(file => {
                const dimensionPrefix = this.getDimensionPrefix(dimension);
                return file.startsWith(dimensionPrefix);
            })
            .sort();

        return files;
    }

    /**
     * Gets the dimension prefix for migration files.
     * 
     * @param dimension The dimension
     * @returns The prefix (e.g., "001" for X, "002" for Y, etc.)
     */
    private getDimensionPrefix(dimension: Dimension): string {
        const prefixes: Record<Dimension, string> = {
            X: '001',
            Y: '002',
            Z: '003',
            W: '004',
            T: '005',
            V: '006'  // V-dimension (vectors)
        };
        return prefixes[dimension];
    }

    /**
     * Gets the required tables for a dimension.
     * 
     * @param dimension The dimension
     * @returns Array of required table names
     */
    private getRequiredTables(dimension: Dimension): string[] {
        const tables: Record<Dimension, string[]> = {
            X: ['modules', 'module_symbols', 'module_id_mapping'],
            Y: ['symbols', 'symbol_dependencies', 'symbol_id_mapping'],
            Z: ['dependencies', 'dependency_graph_cache', 'dependency_symbol_evidence', 'dependency_id_mapping'],
            W: ['adrs', 'adr_file_mappings', 'adr_id_mapping'],
            T: ['change_reports', 'symbol_changes', 'dependency_changes', 'change_id_mapping'],
            V: ['embeddings', 'importance_scores', 'navigation_metadata', 'entry_points']
        };
        return tables[dimension] || [];
    }

    /**
     * Checks if all required tables exist in the database.
     * 
     * @param db The SQLite database instance
     * @param dimension The dimension to check
     * @returns Promise that resolves to true if all tables exist, false otherwise
     */
    private async checkTablesExist(db: sqlite3.Database, dimension: Dimension): Promise<boolean> {
        const requiredTables = this.getRequiredTables(dimension);
        if (requiredTables.length === 0) {
            return true; // No required tables for this dimension
        }

        return new Promise((resolve, reject) => {
            db.all(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
                (err, rows: any[]) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    const existingTables = new Set(rows.map(row => row.name));
                    const allExist = requiredTables.every(table => existingTables.has(table));
                    resolve(allExist);
                }
            );
        });
    }

    /**
     * Runs all pending migrations for a dimension.
     * 
     * @param dimension The dimension to migrate
     * @returns Promise that resolves when all migrations are applied
     */
    public async migrate(dimension: Dimension): Promise<void> {
        const db = await this.dbManager.getDatabase(dimension);
        const appliedMigrations = await this.getAppliedMigrations(db);
        const appliedVersions = new Set(appliedMigrations.map(m => m.version));

        // Check if tables exist - if migration version is applied but tables are missing,
        // we need to re-run the migration
        const tablesExist = await this.checkTablesExist(db, dimension);
        if (!tablesExist && appliedVersions.size > 0) {
            console.warn(`[MigrationManager] Tables missing for dimension ${dimension} despite applied migrations. Re-running migrations...`);
            // Clear applied migrations to force re-application
            // Note: We don't delete the migrations table, just re-apply all migrations
            // This is safe because migrations use CREATE TABLE IF NOT EXISTS
        }

        const migrationFiles = this.getMigrationFilesForDimension(dimension);
        
        for (const migrationFile of migrationFiles) {
            const versionMatch = migrationFile.match(/^(\d+)_/);
            if (!versionMatch) {
                continue;
            }

            const version = parseInt(versionMatch[1], 10);
            
            const name = migrationFile.replace(/^\d+_/, '').replace(/\.sql$/, '');
            const sql = this.readMigrationFile(migrationFile);

            // Check if this specific migration (version + name) already exists in database
            const migrationExists = await this.checkMigrationExists(db, version, name);
            
            // If tables don't exist, re-apply migration even if version is marked as applied
            if (appliedVersions.has(version) && tablesExist) {
                // Check if this specific migration was applied
                const specificMigrationApplied = appliedMigrations.some(m => m.version === version && m.name === name);
                if (specificMigrationApplied) {
                    continue;
                }
            }

            // If this specific migration is already applied but tables are missing, we still need to apply the migration
            // But we should not insert duplicate migration records
            if (migrationExists && !tablesExist) {
                // Re-apply migration without inserting migration record (it already exists)
                console.log(`[MigrationManager] Re-applying migration ${version}_${name} for dimension ${dimension} (tables missing)`);
                await new Promise<void>((resolve, reject) => {
                    db.exec(sql, (err) => {
                        if (err) {
                            reject(new Error(`Failed to re-apply migration ${version}_${name}: ${err.message}`));
                        } else {
                            resolve();
                        }
                    });
                });
            } else if (migrationExists && tablesExist) {
                // This specific migration exists and tables exist - skip
                continue;
            } else {
                // Normal migration application (this specific migration doesn't exist in DB)
                await this.applyMigration(db, version, name, sql);
            }
        }

        // Verify tables exist after migration
        const finalTablesExist = await this.checkTablesExist(db, dimension);
        if (!finalTablesExist) {
            const missingTables = this.getRequiredTables(dimension).filter(table => {
                // We can't easily check which specific tables are missing without another query
                // So we just log a warning
                return true;
            });
            console.warn(`[MigrationManager] Warning: Some required tables may still be missing for dimension ${dimension} after migration`);
        }
    }

    /**
     * Runs all pending migrations for all dimensions.
     * 
     * @returns Promise that resolves when all migrations are applied
     */
    public async migrateAll(): Promise<void> {
        const dimensions: Dimension[] = ['X', 'Y', 'Z', 'W', 'T', 'V'];
        for (const dimension of dimensions) {
            await this.migrate(dimension);
        }
    }
}

