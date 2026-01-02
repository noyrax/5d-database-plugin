import { MultiDbManager } from '../core/multi-db-manager';
import { SymbolRepository } from '../repositories/symbol-repository';
import { Symbol } from '../models/symbol';

/**
 * API for Y-Dimension: Symbols
 */
export class SymbolApi {
    private dbManager: MultiDbManager;

    constructor(dbManager: MultiDbManager) {
        this.dbManager = dbManager;
    }

    /**
     * Gets a symbol by external symbol ID.
     */
    public async getSymbolById(symbolId: string, pluginId: string): Promise<Symbol | null> {
        const db = await this.dbManager.getDatabase('Y');
        const repository = new SymbolRepository(db);
        return repository.getBySymbolId(symbolId, pluginId);
    }

    /**
     * Gets all symbols for a plugin.
     */
    public async getAllSymbols(pluginId: string): Promise<Symbol[]> {
        const db = await this.dbManager.getDatabase('Y');
        const repository = new SymbolRepository(db);
        return repository.getAll(pluginId);
    }

    /**
     * Gets symbols by file path.
     */
    public async getSymbolsByPath(path: string, pluginId: string): Promise<Symbol[]> {
        const db = await this.dbManager.getDatabase('Y');
        const repository = new SymbolRepository(db);
        return repository.findByPath(path, pluginId);
    }
}

