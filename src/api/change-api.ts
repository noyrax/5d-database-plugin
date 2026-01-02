import { MultiDbManager } from '../core/multi-db-manager';
import { ChangeRepository } from '../repositories/change-repository';
import { ChangeReport, SymbolChange, DependencyChange } from '../models/change';

/**
 * API for T-Dimension: Changes
 */
export class ChangeApi {
    private dbManager: MultiDbManager;

    constructor(dbManager: MultiDbManager) {
        this.dbManager = dbManager;
    }

    /**
     * Gets all change reports for a plugin.
     */
    public async getAllChangeReports(pluginId: string): Promise<ChangeReport[]> {
        const db = await this.dbManager.getDatabase('T');
        const repository = new ChangeRepository(db);
        return repository.getAll(pluginId);
    }

    /**
     * Gets the latest change report for a plugin.
     */
    public async getLatestChangeReport(pluginId: string): Promise<ChangeReport | null> {
        const db = await this.dbManager.getDatabase('T');
        const repository = new ChangeRepository(db);
        return repository.getLatest(pluginId);
    }

    /**
     * Gets symbol changes for a report.
     */
    public async getSymbolChanges(reportId: string): Promise<SymbolChange[]> {
        const db = await this.dbManager.getDatabase('T');
        const repository = new ChangeRepository(db);
        return repository.getSymbolChanges(reportId);
    }

    /**
     * Gets dependency changes for a report.
     */
    public async getDependencyChanges(reportId: string): Promise<DependencyChange[]> {
        const db = await this.dbManager.getDatabase('T');
        const repository = new ChangeRepository(db);
        return repository.getDependencyChanges(reportId);
    }

    /**
     * Gets a change report by ID.
     */
    public async getChangeReportById(id: string, pluginId: string): Promise<ChangeReport | null> {
        const db = await this.dbManager.getDatabase('T');
        const repository = new ChangeRepository(db);
        return repository.getById(id, pluginId);
    }
}

