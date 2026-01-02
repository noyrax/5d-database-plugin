import * as sqlite3 from 'sqlite3';
import { BaseRepositoryImpl } from './base-repository';
import { ChangeReport, SymbolChange, DependencyChange } from '../models/change';
import { Dimension } from '../core/multi-db-manager';

/**
 * Repository for T-Dimension: Changes
 */
export class ChangeRepository extends BaseRepositoryImpl<ChangeReport> {
    constructor(db: sqlite3.Database) {
        super(db, 'T');
    }

    public async create(changeReport: ChangeReport): Promise<ChangeReport> {
        await this.execute(
            `INSERT INTO change_reports (id, plugin_id, run_type, parsed_files, skipped_files, total_dependencies, validation_errors, validation_warnings, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                changeReport.id,
                changeReport.plugin_id,
                changeReport.run_type,
                changeReport.parsed_files,
                changeReport.skipped_files,
                changeReport.total_dependencies,
                changeReport.validation_errors,
                changeReport.validation_warnings,
                changeReport.created_at
            ]
        );
        return changeReport;
    }

    public async getById(id: string, pluginId: string): Promise<ChangeReport | null> {
        const row = await this.queryOne<any>(
            `SELECT * FROM change_reports WHERE id = ? AND plugin_id = ?`,
            [id, pluginId]
        );

        if (!row) {
            return null;
        }

        return this.mapRowToChangeReport(row);
    }

    public async update(changeReport: ChangeReport): Promise<ChangeReport> {
        await this.execute(
            `UPDATE change_reports 
             SET run_type = ?, parsed_files = ?, skipped_files = ?, total_dependencies = ?, validation_errors = ?, validation_warnings = ?
             WHERE id = ? AND plugin_id = ?`,
            [
                changeReport.run_type,
                changeReport.parsed_files,
                changeReport.skipped_files,
                changeReport.total_dependencies,
                changeReport.validation_errors,
                changeReport.validation_warnings,
                changeReport.id,
                changeReport.plugin_id
            ]
        );
        return changeReport;
    }

    public async delete(id: string, pluginId: string): Promise<void> {
        await this.execute(
            `DELETE FROM change_reports WHERE id = ? AND plugin_id = ?`,
            [id, pluginId]
        );
    }

    public async getAll(pluginId: string): Promise<ChangeReport[]> {
        const rows = await this.queryAll<any>(
            `SELECT * FROM change_reports WHERE plugin_id = ? ORDER BY created_at DESC`,
            [pluginId]
        );

        return rows.map(row => this.mapRowToChangeReport(row));
    }

    public async exists(id: string, pluginId: string): Promise<boolean> {
        const row = await this.queryOne<{ count: number }>(
            `SELECT COUNT(*) as count FROM change_reports WHERE id = ? AND plugin_id = ?`,
            [id, pluginId]
        );
        return row !== null && row.count > 0;
    }

    /**
     * Gets the latest change report for a plugin.
     */
    public async getLatest(pluginId: string): Promise<ChangeReport | null> {
        const row = await this.queryOne<any>(
            `SELECT * FROM change_reports WHERE plugin_id = ? ORDER BY created_at DESC LIMIT 1`,
            [pluginId]
        );

        if (!row) {
            return null;
        }

        return this.mapRowToChangeReport(row);
    }

    /**
     * Creates a symbol change.
     */
    public async createSymbolChange(symbolChange: SymbolChange): Promise<SymbolChange> {
        await this.execute(
            `INSERT INTO symbol_changes (id, report_id, change_type, file_path, symbol_name, symbol_kind, old_signature, new_signature)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                symbolChange.id,
                symbolChange.report_id,
                symbolChange.change_type,
                symbolChange.file_path,
                symbolChange.symbol_name,
                symbolChange.symbol_kind,
                symbolChange.old_signature,
                symbolChange.new_signature
            ]
        );
        return symbolChange;
    }

    /**
     * Gets all symbol changes for a report.
     */
    public async getSymbolChanges(reportId: string): Promise<SymbolChange[]> {
        const rows = await this.queryAll<any>(
            `SELECT * FROM symbol_changes WHERE report_id = ?`,
            [reportId]
        );

        return rows.map(row => ({
            id: row.id,
            report_id: row.report_id,
            change_type: row.change_type,
            file_path: row.file_path,
            symbol_name: row.symbol_name,
            symbol_kind: row.symbol_kind,
            old_signature: row.old_signature,
            new_signature: row.new_signature
        }));
    }

    /**
     * Creates a dependency change.
     */
    public async createDependencyChange(dependencyChange: DependencyChange): Promise<DependencyChange> {
        await this.execute(
            `INSERT INTO dependency_changes (id, report_id, change_type, from_module, to_module, dependency_type)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                dependencyChange.id,
                dependencyChange.report_id,
                dependencyChange.change_type,
                dependencyChange.from_module,
                dependencyChange.to_module,
                dependencyChange.dependency_type
            ]
        );
        return dependencyChange;
    }

    /**
     * Gets all dependency changes for a report.
     */
    public async getDependencyChanges(reportId: string): Promise<DependencyChange[]> {
        const rows = await this.queryAll<any>(
            `SELECT * FROM dependency_changes WHERE report_id = ?`,
            [reportId]
        );

        return rows.map(row => ({
            id: row.id,
            report_id: row.report_id,
            change_type: row.change_type,
            from_module: row.from_module,
            to_module: row.to_module,
            dependency_type: row.dependency_type
        }));
    }

    /**
     * Maps a database row to a ChangeReport object.
     */
    private mapRowToChangeReport(row: any): ChangeReport {
        return {
            id: row.id,
            plugin_id: row.plugin_id,
            run_type: row.run_type,
            parsed_files: row.parsed_files,
            skipped_files: row.skipped_files,
            total_dependencies: row.total_dependencies,
            validation_errors: row.validation_errors,
            validation_warnings: row.validation_warnings,
            created_at: new Date(row.created_at)
        };
    }
}

