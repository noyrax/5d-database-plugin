import * as sqlite3 from 'sqlite3';
import { Dimension } from '../core/multi-db-manager';

/**
 * Base repository interface for all dimension repositories.
 * Provides common CRUD operations.
 */
export interface BaseRepository<T> {
    /**
     * Gets the dimension this repository handles.
     */
    getDimension(): Dimension;

    /**
     * Creates a new entity.
     * 
     * @param entity The entity to create
     * @returns Promise that resolves to the created entity
     */
    create(entity: T): Promise<T>;

    /**
     * Gets an entity by ID.
     * 
     * @param id The entity ID
     * @param pluginId The plugin ID
     * @returns Promise that resolves to the entity, or null if not found
     */
    getById(id: string, pluginId: string): Promise<T | null>;

    /**
     * Updates an existing entity.
     * 
     * @param entity The entity to update
     * @returns Promise that resolves to the updated entity
     */
    update(entity: T): Promise<T>;

    /**
     * Deletes an entity by ID (soft delete if supported).
     * 
     * @param id The entity ID
     * @param pluginId The plugin ID
     * @returns Promise that resolves when the entity is deleted
     */
    delete(id: string, pluginId: string): Promise<void>;

    /**
     * Gets all entities for a plugin.
     * 
     * @param pluginId The plugin ID
     * @returns Promise that resolves to an array of entities
     */
    getAll(pluginId: string): Promise<T[]>;

    /**
     * Checks if an entity exists.
     * 
     * @param id The entity ID
     * @param pluginId The plugin ID
     * @returns Promise that resolves to true if the entity exists
     */
    exists(id: string, pluginId: string): Promise<boolean>;
}

/**
 * Base implementation helper for repositories.
 * Provides common database access patterns.
 */
export abstract class BaseRepositoryImpl<T> implements BaseRepository<T> {
    protected db: sqlite3.Database;
    protected dimension: Dimension;

    constructor(db: sqlite3.Database, dimension: Dimension) {
        this.db = db;
        this.dimension = dimension;
    }

    public getDimension(): Dimension {
        return this.dimension;
    }

    /**
     * Executes a query and returns a single row.
     */
    protected async queryOne<TResult>(
        sql: string,
        params: any[] = []
    ): Promise<TResult | null> {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row: TResult | undefined) => {
                if (err) {
                    reject(err);
                } else if (row) {
                    resolve(row);
                } else {
                    resolve(null);
                }
            });
        });
    }

    /**
     * Executes a query and returns multiple rows.
     */
    protected async queryAll<TResult>(
        sql: string,
        params: any[] = []
    ): Promise<TResult[]> {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows: TResult[] | undefined) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows || []);
                }
            });
        });
    }

    /**
     * Executes an INSERT, UPDATE, or DELETE statement.
     */
    protected async execute(
        sql: string,
        params: any[] = []
    ): Promise<sqlite3.RunResult> {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this);
                }
            });
        });
    }

    // Abstract methods that must be implemented by subclasses
    public abstract create(entity: T): Promise<T>;
    public abstract getById(id: string, pluginId: string): Promise<T | null>;
    public abstract update(entity: T): Promise<T>;
    public abstract delete(id: string, pluginId: string): Promise<void>;
    public abstract getAll(pluginId: string): Promise<T[]>;
    public abstract exists(id: string, pluginId: string): Promise<boolean>;
}

