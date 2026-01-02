import * as sqlite3 from 'sqlite3';
import { MultiDbManager, Dimension } from './multi-db-manager';

/**
 * Transaction operation that can be executed within a transaction
 */
export type TransactionOperation = (db: sqlite3.Database) => Promise<void>;

/**
 * Manages transactions across multiple databases (all 5 dimensions).
 * Ensures atomicity: either all operations succeed or all are rolled back.
 */
export class TransactionManager {
    private dbManager: MultiDbManager;
    private activeTransactions: Map<Dimension, sqlite3.Database> = new Map();

    /**
     * Creates a new TransactionManager instance.
     * 
     * @param dbManager The MultiDbManager instance
     */
    constructor(dbManager: MultiDbManager) {
        this.dbManager = dbManager;
    }

    /**
     * Begins a transaction on a database.
     * 
     * @param db The SQLite database instance
     * @returns Promise that resolves when the transaction is begun
     */
    private async beginTransaction(db: sqlite3.Database): Promise<void> {
        return new Promise((resolve, reject) => {
            db.run('BEGIN TRANSACTION', (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * Commits a transaction on a database.
     * 
     * @param db The SQLite database instance
     * @returns Promise that resolves when the transaction is committed
     */
    private async commitTransaction(db: sqlite3.Database): Promise<void> {
        return new Promise((resolve, reject) => {
            db.run('COMMIT', (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * Rolls back a transaction on a database.
     * 
     * @param db The SQLite database instance
     * @returns Promise that resolves when the transaction is rolled back
     */
    private async rollbackTransaction(db: sqlite3.Database): Promise<void> {
        return new Promise((resolve, reject) => {
            db.run('ROLLBACK', (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * Executes operations in a transaction across multiple dimensions.
     * If any operation fails, all transactions are rolled back.
     * 
     * @param operations Map of dimension to operation function
     * @returns Promise that resolves when all operations succeed, or rejects if any fail
     */
    public async executeTransaction(
        operations: Map<Dimension, TransactionOperation>
    ): Promise<void> {
        const dimensions = Array.from(operations.keys());
        const databases: Map<Dimension, sqlite3.Database> = new Map();

        try {
            for (const dimension of dimensions) {
                const db = await this.dbManager.getDatabase(dimension);
                databases.set(dimension, db);
                await this.beginTransaction(db);
                this.activeTransactions.set(dimension, db);
            }

            for (const [dimension, operation] of operations.entries()) {
                const db = databases.get(dimension)!;
                await operation(db);
            }

            for (const db of databases.values()) {
                await this.commitTransaction(db);
            }

            this.activeTransactions.clear();
        } catch (error) {
            for (const db of databases.values()) {
                try {
                    await this.rollbackTransaction(db);
                } catch (rollbackError) {
                    console.error('Failed to rollback transaction:', rollbackError);
                }
            }
            this.activeTransactions.clear();
            throw error;
        }
    }

    /**
     * Executes operations in a transaction across all dimensions.
     * 
     * @param operations Map of dimension to operation function
     * @returns Promise that resolves when all operations succeed
     */
    public async executeTransactionAll(
        operations: Map<Dimension, TransactionOperation>
    ): Promise<void> {
        return this.executeTransaction(operations);
    }

    /**
     * Checks if there are any active transactions.
     * 
     * @returns True if there are active transactions
     */
    public hasActiveTransactions(): boolean {
        return this.activeTransactions.size > 0;
    }

    /**
     * Gets the list of dimensions with active transactions.
     * 
     * @returns Array of dimensions with active transactions
     */
    public getActiveTransactionDimensions(): Dimension[] {
        return Array.from(this.activeTransactions.keys());
    }
}

