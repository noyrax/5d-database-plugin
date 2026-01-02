import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { BaseIngestor } from './base-ingestor';
import { Dimension } from '../core/multi-db-manager';
import { MultiDbManager } from '../core/multi-db-manager';
import { ChangeRepository } from '../repositories/change-repository';
import { ChangeReport, SymbolChange, DependencyChange } from '../models/change';

/**
 * Ingests change reports from docs/system/CHANGE_REPORT.md (T-Dimension)
 * Changes are immutable - always creates new entries
 */
export class ChangeIngestor implements BaseIngestor {
    private dbManager: MultiDbManager;

    constructor(dbManager: MultiDbManager) {
        this.dbManager = dbManager;
    }

    public getDimension(): Dimension {
        return 'T';
    }

    public async ingestFull(workspaceRoot: string, pluginId: string, docsPath: string): Promise<void> {
        if (!docsPath) {
            return;
        }

        const changeFile = path.join(docsPath, 'system', 'CHANGE_REPORT.md');
        
        if (!fs.existsSync(changeFile)) {
            return;
        }

        const db = await this.dbManager.getDatabase('T');
        const repository = new ChangeRepository(db);

        const content = fs.readFileSync(changeFile, 'utf-8');
        await this.parseAndIngestChangeReport(content, pluginId, repository);
    }

    public async ingestIncremental(workspaceRoot: string, pluginId: string, docsPath: string): Promise<void> {
        if (!docsPath) {
            return;
        }

        const changeFile = path.join(docsPath, 'system', 'CHANGE_REPORT.md');
        
        if (!fs.existsSync(changeFile)) {
            return;
        }

        const db = await this.dbManager.getDatabase('T');
        const repository = new ChangeRepository(db);

        const latest = await repository.getLatest(pluginId);
        const content = fs.readFileSync(changeFile, 'utf-8');
        
        if (latest) {
            const latestTimestamp = latest.created_at.toISOString();
            if (content.includes(latestTimestamp)) {
                return;
            }
        }

        await this.parseAndIngestChangeReport(content, pluginId, repository);
    }

    /**
     * Parses and ingests a change report.
     */
    private async parseAndIngestChangeReport(
        content: string,
        pluginId: string,
        repository: ChangeRepository
    ): Promise<void> {
        const report = this.parseChangeReport(content, pluginId);
        await repository.create(report);

        const symbolChanges = this.parseSymbolChanges(content);
        for (const change of symbolChanges) {
            await repository.createSymbolChange({
                ...change,
                report_id: report.id
            });
        }

        const dependencyChanges = this.parseDependencyChanges(content);
        for (const change of dependencyChanges) {
            await repository.createDependencyChange({
                ...change,
                report_id: report.id
            });
        }
    }

    /**
     * Parses change report header.
     * Supports both English and German labels.
     */
    private parseChangeReport(content: string, pluginId: string): ChangeReport {
        // Run Type / Letzter Lauf
        const runTypeMatch = content.match(/(?:Run Type|Letzter Lauf):\s*(\w+)/i);
        
        // Parsed Files / Geparste Dateien
        const parsedFilesMatch = content.match(/(?:Parsed Files|Geparste Dateien):\s*(\d+)/i);
        
        // Skipped Files / Übersprungene Dateien
        const skippedFilesMatch = content.match(/(?:Skipped Files|Übersprungene Dateien):\s*(\d+)/i);
        
        // Total Dependencies / Gesamt: X Dependencies
        const totalDepsMatch = content.match(/(?:Total Dependencies:\s*(\d+)|Gesamt:\s*(\d+)\s+Dependencies)/i);
        const totalDeps = totalDepsMatch?.[1] || totalDepsMatch?.[2] || '0';
        
        // Validation Errors / Validierungsfehler / Fehler
        const validationErrorsMatch = content.match(/(?:Validation Errors|Validierungsfehler|Fehler):\s*(\d+)/i);
        
        // Validation Warnings / Validierungswarnungen / Warnungen
        const validationWarningsMatch = content.match(/(?:Validation Warnings|Validierungswarnungen|Warnungen):\s*(\d+)/i);

        return {
            id: uuidv4(),
            plugin_id: pluginId,
            run_type: (runTypeMatch?.[1]?.toLowerCase() === 'incremental' ? 'incremental' : 'full') as 'full' | 'incremental',
            parsed_files: parseInt(parsedFilesMatch?.[1] || '0', 10),
            skipped_files: parseInt(skippedFilesMatch?.[1] || '0', 10),
            total_dependencies: parseInt(totalDeps, 10),
            validation_errors: parseInt(validationErrorsMatch?.[1] || '0', 10),
            validation_warnings: parseInt(validationWarningsMatch?.[1] || '0', 10),
            created_at: new Date()
        };
    }

    /**
     * Parses symbol changes from change report.
     */
    private parseSymbolChanges(content: string): Omit<SymbolChange, 'report_id'>[] {
        const changes: Omit<SymbolChange, 'report_id'>[] = [];
        const lines = content.split('\n');

        let inSymbolChangesSection = false;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            if (line.includes('Symbol Changes') || line.includes('## Symbol Changes')) {
                inSymbolChangesSection = true;
                continue;
            }

            if (inSymbolChangesSection && (line.startsWith('##') || line.startsWith('# '))) {
                break;
            }

            if (inSymbolChangesSection && line.match(/^[-*]\s*(added|removed|changed):/i)) {
                const match = line.match(/^[-*]\s*(\w+):\s*(.+?)\s+\((\w+)\)/i);
                if (match) {
                    changes.push({
                        id: uuidv4(),
                        change_type: match[1].toLowerCase() as 'added' | 'removed' | 'changed',
                        file_path: this.extractFilePath(lines, i),
                        symbol_name: match[2],
                        symbol_kind: match[3],
                        old_signature: null,
                        new_signature: null
                    });
                }
            }
        }

        return changes;
    }

    /**
     * Parses dependency changes from change report.
     */
    private parseDependencyChanges(content: string): Omit<DependencyChange, 'report_id'>[] {
        const changes: Omit<DependencyChange, 'report_id'>[] = [];
        const lines = content.split('\n');

        let inDependencyChangesSection = false;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            if (line.includes('Dependency Changes') || line.includes('## Dependency Changes')) {
                inDependencyChangesSection = true;
                continue;
            }

            if (inDependencyChangesSection && (line.startsWith('##') || line.startsWith('# '))) {
                break;
            }

            if (inDependencyChangesSection && line.match(/^[-*]\s*(added|removed):/i)) {
                const match = line.match(/^[-*]\s*(\w+):\s*(.+?)\s+->\s+(.+?)\s+\[(\w+)\]/i);
                if (match) {
                    changes.push({
                        id: uuidv4(),
                        change_type: match[1].toLowerCase() as 'added' | 'removed',
                        from_module: match[2].trim(),
                        to_module: match[3].trim(),
                        dependency_type: match[4]
                    });
                }
            }
        }

        return changes;
    }

    /**
     * Extracts file path from context lines.
     */
    private extractFilePath(lines: string[], currentIndex: number): string {
        for (let i = currentIndex - 5; i <= currentIndex; i++) {
            if (i >= 0 && i < lines.length) {
                const match = lines[i].match(/`([^`]+\.(ts|js|tsx|jsx|py))`/);
                if (match) {
                    return match[1];
                }
            }
        }
        return 'unknown';
    }
}

