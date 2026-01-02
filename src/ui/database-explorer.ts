import * as vscode from 'vscode';
import { MultiDbManager } from '../core/multi-db-manager';
import { ModuleApi } from '../api/module-api';
import { SymbolApi } from '../api/symbol-api';
import { DependencyApi } from '../api/dependency-api';
import { AdrApi } from '../api/adr-api';
import { ChangeApi } from '../api/change-api';
import { AdrRepository } from '../repositories/adr-repository';

/**
 * Tree item for database explorer.
 */
class DatabaseTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly command?: vscode.Command
    ) {
        super(label, collapsibleState);
        if (command) {
            this.command = command;
        }
    }
}

/**
 * Database Explorer Tree Data Provider.
 * Shows the 5 dimensions in the VS Code Explorer.
 */
export class DatabaseExplorerProvider implements vscode.TreeDataProvider<DatabaseTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<DatabaseTreeItem | undefined | null | void> = new vscode.EventEmitter<DatabaseTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<DatabaseTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private dbManager: MultiDbManager;
    private pluginId: string;

    constructor(context: vscode.ExtensionContext, dbManager: MultiDbManager) {
        this.dbManager = dbManager;
        this.pluginId = dbManager.getPluginId();
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: DatabaseTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: DatabaseTreeItem): Promise<DatabaseTreeItem[]> {
        if (!element) {
            return [
                new DatabaseTreeItem('X: Modules', vscode.TreeItemCollapsibleState.Collapsed),
                new DatabaseTreeItem('Y: Symbols', vscode.TreeItemCollapsibleState.Collapsed),
                new DatabaseTreeItem('Z: Dependencies', vscode.TreeItemCollapsibleState.Collapsed),
                new DatabaseTreeItem('W: ADRs', vscode.TreeItemCollapsibleState.Collapsed),
                new DatabaseTreeItem('T: Changes', vscode.TreeItemCollapsibleState.Collapsed)
            ];
        }

        try {
            if (element.label.startsWith('X: Modules')) {
                const moduleApi = new ModuleApi(this.dbManager);
                const modules = await moduleApi.getAllModules(this.pluginId);
                if (modules.length === 0) {
                    return [new DatabaseTreeItem(
                        'No modules found. Run ingestion first.',
                        vscode.TreeItemCollapsibleState.None,
                        {
                            command: '5d-database.ingest',
                            title: 'Run Ingestion',
                            arguments: []
                        }
                    )];
                }
                return modules.map(m => {
                    const item = new DatabaseTreeItem(
                        m.file_path,
                        vscode.TreeItemCollapsibleState.None,
                        {
                            command: '5d-database.showModuleDetail',
                            title: 'Show Module Detail',
                            arguments: [m.id]
                        }
                    );
                    item.contextValue = 'module';
                    item.tooltip = `Click to view details or right-click to open source file: ${m.file_path}`;
                    return item;
                });
            } else if (element.label.startsWith('Y: Symbols')) {
                const symbolApi = new SymbolApi(this.dbManager);
                const symbols = await symbolApi.getAllSymbols(this.pluginId);
                if (symbols.length === 0) {
                    return [new DatabaseTreeItem(
                        'No symbols found. Run ingestion first.',
                        vscode.TreeItemCollapsibleState.None,
                        {
                            command: '5d-database.ingest',
                            title: 'Run Ingestion',
                            arguments: []
                        }
                    )];
                }
                return symbols.slice(0, 100).map(s => {
                    const item = new DatabaseTreeItem(
                        `${s.name} (${s.kind})`,
                        vscode.TreeItemCollapsibleState.None,
                        {
                            command: '5d-database.showSymbolDetail',
                            title: 'Show Symbol Detail',
                            arguments: [s.symbol_id]
                        }
                    );
                    item.contextValue = 'symbol';
                    item.tooltip = `Click to view details or right-click to open source file: ${s.path}`;
                    // Store path for navigation
                    (item as any).filePath = s.path;
                    return item;
                });
            } else if (element.label.startsWith('Z: Dependencies')) {
                const depApi = new DependencyApi(this.dbManager);
                const deps = await depApi.getAllDependencies(this.pluginId);
                if (deps.length === 0) {
                    return [new DatabaseTreeItem(
                        'No dependencies found. Run ingestion first.',
                        vscode.TreeItemCollapsibleState.None,
                        {
                            command: '5d-database.ingest',
                            title: 'Run Ingestion',
                            arguments: []
                        }
                    )];
                }
                return deps.slice(0, 100).map(d => {
                    const item = new DatabaseTreeItem(
                        `${d.from_module} → ${d.to_module}`,
                        vscode.TreeItemCollapsibleState.None,
                        {
                            command: '5d-database.showDependencyDetail',
                            title: 'Show Dependency Detail',
                            arguments: [d.id]
                        }
                    );
                    item.contextValue = 'dependency';
                    item.tooltip = `Click to view details or right-click to open source file: ${d.from_module} → ${d.to_module}`;
                    // Store paths for navigation
                    (item as any).fromPath = d.from_module;
                    (item as any).toPath = d.to_module;
                    return item;
                });
            } else if (element.label.startsWith('W: ADRs')) {
                const adrApi = new AdrApi(this.dbManager);
                const adrs = await adrApi.getAllAdrs(this.pluginId);
                if (adrs.length === 0) {
                    return [new DatabaseTreeItem(
                        'No ADRs found. Run ingestion first.',
                        vscode.TreeItemCollapsibleState.None,
                        {
                            command: '5d-database.ingest',
                            title: 'Run Ingestion',
                            arguments: []
                        }
                    )];
                }
                return adrs.map(a => {
                    const item = new DatabaseTreeItem(
                        `ADR-${a.adr_number}: ${a.title}`,
                        vscode.TreeItemCollapsibleState.None,
                        {
                            command: '5d-database.showAdrDetail',
                            title: 'Show ADR Detail',
                            arguments: [a.adr_number]
                        }
                    );
                    item.contextValue = 'adr';
                    item.tooltip = `Click to view ADR details`;
                    return item;
                });
            } else if (element.label.startsWith('T: Changes')) {
                const changeApi = new ChangeApi(this.dbManager);
                const reports = await changeApi.getAllChangeReports(this.pluginId);
                if (reports.length === 0) {
                    return [new DatabaseTreeItem(
                        'No change reports found. Run ingestion first.',
                        vscode.TreeItemCollapsibleState.None,
                        {
                            command: '5d-database.ingest',
                            title: 'Run Ingestion',
                            arguments: []
                        }
                    )];
                }
                return reports.slice(0, 10).map(r => {
                    const label = `${r.run_type} - ${r.created_at.toLocaleDateString()} (${r.parsed_files} files, ${r.total_dependencies} deps)`;
                    const item = new DatabaseTreeItem(
                        label,
                        vscode.TreeItemCollapsibleState.None,
                        {
                            command: '5d-database.showChangeDetail',
                            title: 'Show Change Report Detail',
                            arguments: [r.id]
                        }
                    );
                    item.contextValue = 'change';
                    item.tooltip = `Click to view details`;
                    return item;
                });
            }
        } catch (error: any) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            // Check if it's a "no such table" error
            if (errorMessage.includes('no such table') || errorMessage.includes('SQLITE_ERROR')) {
                return [new DatabaseTreeItem(
                    `Database not initialized. Run ingestion first. (Error: ${errorMessage})`,
                    vscode.TreeItemCollapsibleState.None,
                    {
                        command: '5d-database.ingest',
                        title: 'Run Ingestion',
                        arguments: []
                    }
                )];
            }
            // For other errors, show error message
            vscode.window.showErrorMessage(`Error loading ${element.label}: ${errorMessage}`);
            return [new DatabaseTreeItem(
                `Error: ${errorMessage}`,
                vscode.TreeItemCollapsibleState.None
            )];
        }

        return [];
    }
}

