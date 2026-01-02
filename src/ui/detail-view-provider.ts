import * as vscode from 'vscode';
import * as path from 'path';
import { MultiDbManager } from '../core/multi-db-manager';
import { ModuleApi } from '../api/module-api';
import { SymbolApi } from '../api/symbol-api';
import { AdrApi } from '../api/adr-api';
import { DependencyApi } from '../api/dependency-api';
import { ChangeApi } from '../api/change-api';
import { Module } from '../models/module';
import { Symbol } from '../models/symbol';
import { Adr } from '../models/adr';
import { Dependency } from '../models/dependency';
import { ChangeReport, SymbolChange, DependencyChange } from '../models/change';
import { SymbolRepository } from '../repositories/symbol-repository';
import { AdrRepository } from '../repositories/adr-repository';
import { CrossDimensionApi } from '../api/cross-dimension-api';
import { IdMapper } from '../core/id-mapper';

/**
 * Provider for detail views in VS Code WebView.
 * Shows detailed information for Modules, Symbols, ADRs, Dependencies, and Change Reports.
 */
export class DetailViewProvider {
    private panels: Map<string, vscode.WebviewPanel> = new Map();
    private dbManager: MultiDbManager;
    private pluginId: string;
    private crossDimensionApi: CrossDimensionApi;

    constructor(dbManager: MultiDbManager) {
        this.dbManager = dbManager;
        this.pluginId = dbManager.getPluginId();
        const idMapper = new IdMapper(dbManager);
        this.crossDimensionApi = new CrossDimensionApi(dbManager, idMapper);
    }

    /**
     * Shows module detail view.
     */
    public async showModuleDetail(moduleId: string): Promise<void> {
        const moduleApi = new ModuleApi(this.dbManager);
        // Try to get by ID first (moduleId is typically an ID)
        let module = await moduleApi.getModuleById(moduleId, this.pluginId);
        
        if (!module) {
            // Try to get by file path if moduleId is actually a file path
            module = await moduleApi.getModuleByPath(moduleId, this.pluginId);
        }
        
        if (!module) {
            vscode.window.showErrorMessage(`Module not found: ${moduleId}`);
            return;
        }
        
        await this.createModulePanel(module);
    }

    /**
     * Shows symbol detail view.
     */
    public async showSymbolDetail(symbolId: string): Promise<void> {
        const symbolApi = new SymbolApi(this.dbManager);
        const symbol = await symbolApi.getSymbolById(symbolId, this.pluginId);
        
        if (!symbol) {
            vscode.window.showErrorMessage(`Symbol not found: ${symbolId}`);
            return;
        }
        
        await this.createSymbolPanel(symbol);
    }

    /**
     * Shows ADR detail view.
     */
    public async showAdrDetail(adrId: string): Promise<void> {
        const adrApi = new AdrApi(this.dbManager);
        // Try to get by ADR number first
        const adr = await adrApi.getAdrByNumber(adrId, this.pluginId);
        
        if (!adr) {
            // Try to get by ID if adrId is actually an ID
            const db = await this.dbManager.getDatabase('W');
            const repo = new AdrRepository(db);
            const adrById = await repo.getById(adrId, this.pluginId);
            
            if (!adrById) {
                vscode.window.showErrorMessage(`ADR not found: ${adrId}`);
                return;
            }
            
            await this.createAdrPanel(adrById);
        } else {
            await this.createAdrPanel(adr);
        }
    }

    /**
     * Shows dependency detail view.
     */
    public async showDependencyDetail(dependencyId: string): Promise<void> {
        const dependencyApi = new DependencyApi(this.dbManager);
        const dependency = await dependencyApi.getDependencyById(dependencyId, this.pluginId);
        
        if (!dependency) {
            vscode.window.showErrorMessage(`Dependency not found: ${dependencyId}`);
            return;
        }
        
        await this.createDependencyPanel(dependency);
    }

    /**
     * Shows change report detail view.
     */
    public async showChangeDetail(reportId: string): Promise<void> {
        const changeApi = new ChangeApi(this.dbManager);
        const report = await changeApi.getChangeReportById(reportId, this.pluginId);
        
        if (!report) {
            vscode.window.showErrorMessage(`Change report not found: ${reportId}`);
            return;
        }

        const symbolChanges = await changeApi.getSymbolChanges(reportId);
        const dependencyChanges = await changeApi.getDependencyChanges(reportId);
        
        await this.createChangePanel(report, symbolChanges, dependencyChanges);
    }

    /**
     * Creates a WebView panel for module detail.
     */
    private async createModulePanel(module: Module): Promise<void> {
        const panelKey = `module-${module.id}`;
        
        // Reuse existing panel if available
        const existingPanel = this.panels.get(panelKey);
        if (existingPanel) {
            existingPanel.reveal();
            return;
        }

        // Get related symbols
        const relatedSymbols = await this.crossDimensionApi.getSymbolsForModule(module.file_path, this.pluginId);

        const panel = vscode.window.createWebviewPanel(
            '5d-database-module-detail',
            `Module: ${path.basename(module.file_path)}`,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        panel.webview.html = this.getModuleHtml(module, relatedSymbols.map(s => ({ external_id: s.external_id, label: s.external_id })));
        
        // Handle messages from webview (for command links)
        panel.webview.onDidReceiveMessage(
            async message => {
                if (message.command === 'executeCommand') {
                    const command = message.commandName;
                    const args = message.args || [];
                    await vscode.commands.executeCommand(command, ...args);
                }
            },
            null,
            []
        );
        
        panel.onDidDispose(() => {
            this.panels.delete(panelKey);
        });

        this.panels.set(panelKey, panel);
    }

    /**
     * Creates a WebView panel for symbol detail.
     */
    private async createSymbolPanel(symbol: Symbol): Promise<void> {
        const panelKey = `symbol-${symbol.id}`;
        
        // Reuse existing panel if available
        const existingPanel = this.panels.get(panelKey);
        if (existingPanel) {
            existingPanel.reveal();
            return;
        }

        // Get symbol dependencies
        const db = await this.dbManager.getDatabase('Y');
        const symbolRepo = new SymbolRepository(db);
        const dependencies = await symbolRepo.getSymbolDependencies(symbol.id);

        // Get related module
        const relatedModule = await this.crossDimensionApi.resolveSymbolToModule(symbol.symbol_id, this.pluginId);

        const panel = vscode.window.createWebviewPanel(
            '5d-database-symbol-detail',
            `Symbol: ${symbol.name}`,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        panel.webview.html = this.getSymbolHtml(symbol, dependencies, relatedModule ? { external_id: relatedModule.external_id, label: relatedModule.external_id } : null);
        
        // Handle messages from webview (for command links)
        panel.webview.onDidReceiveMessage(
            async message => {
                if (message.command === 'executeCommand') {
                    const command = message.commandName;
                    const args = message.args || [];
                    await vscode.commands.executeCommand(command, ...args);
                }
            },
            null,
            []
        );
        
        panel.onDidDispose(() => {
            this.panels.delete(panelKey);
        });

        this.panels.set(panelKey, panel);
    }

    /**
     * Creates a WebView panel for ADR detail.
     */
    private async createAdrPanel(adr: Adr): Promise<void> {
        const panelKey = `adr-${adr.id}`;
        
        // Reuse existing panel if available
        const existingPanel = this.panels.get(panelKey);
        if (existingPanel) {
            existingPanel.reveal();
            return;
        }

        // Get ADR file mappings
        const db = await this.dbManager.getDatabase('W');
        const adrRepo = new AdrRepository(db);
        const fileMappings = await adrRepo.getAdrFileMappings(adr.id);

        // Get ADRs for each file (inverse mapping)
        const relatedAdrs: Array<{ file_path: string; adrs: Array<{ adr_number: string; title: string }> }> = [];
        for (const mapping of fileMappings) {
            const adrsForFile = await this.crossDimensionApi.getAdrsForFilePath(mapping.file_path, this.pluginId);
            if (adrsForFile.length > 0) {
                // Get ADR details to get title
                const adrApi = new AdrApi(this.dbManager);
                const adrDetails = await Promise.all(
                    adrsForFile.map(a => adrApi.getAdrByNumber(a.external_id, this.pluginId))
                );
                relatedAdrs.push({
                    file_path: mapping.file_path,
                    adrs: adrDetails
                        .filter((a): a is NonNullable<typeof a> => a !== null)
                        .map(a => ({ adr_number: a.adr_number, title: a.title }))
                });
            }
        }

        const panel = vscode.window.createWebviewPanel(
            '5d-database-adr-detail',
            `ADR-${adr.adr_number}: ${adr.title}`,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        panel.webview.html = this.getAdrHtml(adr, fileMappings, relatedAdrs);
        
        // Handle messages from webview (for command links)
        panel.webview.onDidReceiveMessage(
            async message => {
                if (message.command === 'executeCommand') {
                    const command = message.commandName;
                    const args = message.args || [];
                    await vscode.commands.executeCommand(command, ...args);
                }
            },
            null,
            []
        );
        
        panel.onDidDispose(() => {
            this.panels.delete(panelKey);
        });

        this.panels.set(panelKey, panel);
    }

    /**
     * Creates a WebView panel for dependency detail.
     */
    private async createDependencyPanel(dependency: Dependency): Promise<void> {
        const panelKey = `dependency-${dependency.id}`;
        
        // Reuse existing panel if available
        const existingPanel = this.panels.get(panelKey);
        if (existingPanel) {
            existingPanel.reveal();
            return;
        }

        // Get related modules
        const moduleApi = new ModuleApi(this.dbManager);
        const fromModule = await moduleApi.getModuleByPath(dependency.from_module, this.pluginId);
        const toModule = await moduleApi.getModuleByPath(dependency.to_module, this.pluginId);

        const panel = vscode.window.createWebviewPanel(
            '5d-database-dependency-detail',
            `Dependency: ${path.basename(dependency.from_module)} → ${path.basename(dependency.to_module)}`,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        panel.webview.html = this.getDependencyHtml(dependency, fromModule, toModule);
        
        // Handle messages from webview (for command links)
        panel.webview.onDidReceiveMessage(
            async message => {
                if (message.command === 'executeCommand') {
                    const command = message.commandName;
                    const args = message.args || [];
                    await vscode.commands.executeCommand(command, ...args);
                }
            },
            null,
            []
        );
        
        panel.onDidDispose(() => {
            this.panels.delete(panelKey);
        });

        this.panels.set(panelKey, panel);
    }

    /**
     * Creates a WebView panel for change report detail.
     */
    private async createChangePanel(
        report: ChangeReport,
        symbolChanges: SymbolChange[],
        dependencyChanges: DependencyChange[]
    ): Promise<void> {
        const panelKey = `change-${report.id}`;
        
        // Reuse existing panel if available
        const existingPanel = this.panels.get(panelKey);
        if (existingPanel) {
            existingPanel.reveal();
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            '5d-database-change-detail',
            `Change Report: ${report.run_type} - ${report.created_at.toLocaleDateString()}`,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        panel.webview.html = this.getChangeHtml(report, symbolChanges, dependencyChanges);
        
        // Handle messages from webview (for command links)
        panel.webview.onDidReceiveMessage(
            async message => {
                if (message.command === 'executeCommand') {
                    const command = message.commandName;
                    const args = message.args || [];
                    await vscode.commands.executeCommand(command, ...args);
                }
            },
            null,
            []
        );
        
        panel.onDidDispose(() => {
            this.panels.delete(panelKey);
        });

        this.panels.set(panelKey, panel);
    }

    /**
     * Generates HTML for module detail view.
     */
    private getModuleHtml(module: Module, relatedSymbols: Array<{ external_id: string; label: string }>): string {
        const markdown = module.content_markdown || '*No content available*';
        const openFileCommand = JSON.stringify(['5d-database.openSourceFile', [module.file_path]]);
        
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Module: ${this.escapeHtml(module.file_path)}</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
        }
        h1 {
            color: var(--vscode-textLink-foreground);
            border-bottom: 2px solid var(--vscode-panel-border);
            padding-bottom: 10px;
        }
        .metadata {
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            padding: 15px;
            border-radius: 5px;
            margin-bottom: 20px;
        }
        .metadata-item {
            margin: 5px 0;
        }
        .metadata-label {
            font-weight: bold;
            color: var(--vscode-textLink-foreground);
        }
        .content {
            margin-top: 20px;
        }
        pre {
            background-color: var(--vscode-textCodeBlock-background);
            padding: 10px;
            border-radius: 5px;
            overflow-x: auto;
        }
        code {
            font-family: var(--vscode-editor-font-family);
        }
    </style>
    <script>
        const vscode = acquireVsCodeApi();
        document.addEventListener('DOMContentLoaded', () => {
            document.querySelectorAll('a[data-command]').forEach(link => {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    const command = link.getAttribute('data-command');
                    const argsJson = link.getAttribute('data-args');
                    const args = argsJson ? JSON.parse(argsJson) : [];
                    vscode.postMessage({
                        command: 'executeCommand',
                        commandName: command,
                        args: args
                    });
                });
            });
        });
    </script>
</head>
<body>
    <h1>Module: ${this.escapeHtml(module.file_path)}</h1>
    
    <div class="metadata">
        <div class="metadata-item">
            <span class="metadata-label">File Path:</span> 
            <a href="#" data-command="5d-database.openSourceFile" data-args="${this.escapeHtml(JSON.stringify([module.file_path]))}" style="color: var(--vscode-textLink-foreground); text-decoration: underline; cursor: pointer;">${this.escapeHtml(module.file_path)}</a>
            <span style="margin-left: 10px; color: var(--vscode-descriptionForeground);">(click to open)</span>
        </div>
        <div class="metadata-item">
            <span class="metadata-label">Content Hash:</span> <code>${this.escapeHtml(module.content_hash)}</code>
        </div>
        <div class="metadata-item">
            <span class="metadata-label">Created:</span> ${module.created_at.toLocaleString()}
        </div>
        <div class="metadata-item">
            <span class="metadata-label">Updated:</span> ${module.updated_at.toLocaleString()}
        </div>
    </div>
    
    <div class="content">
        ${this.markdownToHtml(markdown)}
    </div>
</body>
</html>`;
    }

    /**
     * Generates HTML for symbol detail view.
     */
    private getSymbolHtml(symbol: Symbol, dependencies: Array<{ dependency_module: string; dependency_symbols_json: string | null; is_type_only: boolean; is_reexport: boolean }>, relatedModule: { external_id: string; label: string } | null): string {
        let signature: string;
        try {
            const sigJson = JSON.parse(symbol.signature_json);
            signature = typeof sigJson === 'string' ? sigJson : JSON.stringify(sigJson, null, 2);
        } catch {
            signature = symbol.signature_json;
        }

        const depsHtml = dependencies.length > 0
            ? dependencies.map(dep => {
                let symbolsList = '';
                if (dep.dependency_symbols_json) {
                    try {
                        const symbols = JSON.parse(dep.dependency_symbols_json);
                        if (Array.isArray(symbols) && symbols.length > 0) {
                            symbolsList = ` (${symbols.join(', ')})`;
                        }
                    } catch {
                        // Ignore parse errors
                    }
                }
                const flags = [];
                if (dep.is_type_only) flags.push('type-only');
                if (dep.is_reexport) flags.push('reexport');
                const flagsStr = flags.length > 0 ? ` [${flags.join(', ')}]` : '';
                const depArgs = this.escapeHtml(JSON.stringify([dep.dependency_module]));
                return `<li><a href="#" data-command="5d-database.openSourceFile" data-args="${depArgs}" style="cursor: pointer;"><code>${this.escapeHtml(dep.dependency_module)}</code></a>${symbolsList}${flagsStr}</li>`;
            }).join('\n')
            : '<li><em>No dependencies</em></li>';

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Symbol: ${this.escapeHtml(symbol.name)}</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
        }
        h1 {
            color: var(--vscode-textLink-foreground);
            border-bottom: 2px solid var(--vscode-panel-border);
            padding-bottom: 10px;
        }
        .metadata {
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            padding: 15px;
            border-radius: 5px;
            margin-bottom: 20px;
        }
        .metadata-item {
            margin: 5px 0;
        }
        .metadata-label {
            font-weight: bold;
            color: var(--vscode-textLink-foreground);
        }
        .signature {
            background-color: var(--vscode-textCodeBlock-background);
            padding: 10px;
            border-radius: 5px;
            margin: 10px 0;
            overflow-x: auto;
        }
        .dependencies {
            margin-top: 20px;
        }
        .dependencies ul {
            list-style-type: none;
            padding-left: 0;
        }
        .dependencies li {
            margin: 5px 0;
            padding: 5px;
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 3px;
        }
        a {
            color: var(--vscode-textLink-foreground);
            text-decoration: underline;
            cursor: pointer;
        }
        a:hover {
            color: var(--vscode-textLink-activeForeground);
        }
        code {
            font-family: var(--vscode-editor-font-family);
        }
    </style>
    <script>
        const vscode = acquireVsCodeApi();
        document.addEventListener('DOMContentLoaded', () => {
            document.querySelectorAll('a[data-command]').forEach(link => {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    const command = link.getAttribute('data-command');
                    const argsJson = link.getAttribute('data-args');
                    const args = argsJson ? JSON.parse(argsJson) : [];
                    vscode.postMessage({
                        command: 'executeCommand',
                        commandName: command,
                        args: args
                    });
                });
            });
        });
    </script>
</head>
<body>
    <h1>Symbol: ${this.escapeHtml(symbol.name)}</h1>
    
    <div class="metadata">
        <div class="metadata-item">
            <span class="metadata-label">Name:</span> ${this.escapeHtml(symbol.name)}
        </div>
        <div class="metadata-item">
            <span class="metadata-label">Kind:</span> ${this.escapeHtml(symbol.kind)}
        </div>
        <div class="metadata-item">
            <span class="metadata-label">Path:</span> 
            <a href="#" data-command="5d-database.openSourceFile" data-args="${this.escapeHtml(JSON.stringify([symbol.path]))}" style="color: var(--vscode-textLink-foreground); text-decoration: underline; cursor: pointer;">${this.escapeHtml(symbol.path)}</a>
            <span style="margin-left: 10px; color: var(--vscode-descriptionForeground);">(click to open)</span>
        </div>
        <div class="metadata-item">
            <span class="metadata-label">Symbol ID:</span> <code>${this.escapeHtml(symbol.symbol_id)}</code>
        </div>
        ${symbol.summary ? `<div class="metadata-item"><span class="metadata-label">Summary:</span> ${this.escapeHtml(symbol.summary)}</div>` : ''}
        <div class="metadata-item">
            <span class="metadata-label">Created:</span> ${symbol.created_at.toLocaleString()}
        </div>
        <div class="metadata-item">
            <span class="metadata-label">Updated:</span> ${symbol.updated_at.toLocaleString()}
        </div>
    </div>
    
    <div class="signature">
        <strong>Signature:</strong>
        <pre><code>${this.escapeHtml(signature)}</code></pre>
    </div>
    
    <div class="dependencies">
        <h2>Dependencies</h2>
        <ul>
            ${depsHtml}
        </ul>
    </div>
    
    ${relatedModule ? `
    <div class="related">
        <h2>Related Module</h2>
        <p>
            <a href="#" data-command="5d-database.showModuleDetail" data-args="${this.escapeHtml(JSON.stringify([relatedModule.external_id]))}" style="cursor: pointer;">
                ${this.escapeHtml(relatedModule.label || relatedModule.external_id)}
            </a>
        </p>
    </div>
    ` : ''}
</body>
</html>`;
    }

    /**
     * Generates HTML for ADR detail view.
     */
    private getAdrHtml(adr: Adr, fileMappings: Array<{ file_path: string }>, relatedAdrs: Array<{ file_path: string; adrs: Array<{ adr_number: string; title: string }> }>): string {
        const markdown = adr.content_markdown || '*No content available*';
        
        const filesHtml = fileMappings.length > 0
            ? fileMappings.map(mapping => {
                const fileArgs = this.escapeHtml(JSON.stringify([mapping.file_path]));
                return `<li><a href="#" data-command="5d-database.openSourceFile" data-args="${fileArgs}" style="cursor: pointer;"><code>${this.escapeHtml(mapping.file_path)}</code></a></li>`;
            }).join('\n')
            : '<li><em>No file mappings</em></li>';

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ADR-${this.escapeHtml(adr.adr_number)}: ${this.escapeHtml(adr.title)}</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
        }
        h1 {
            color: var(--vscode-textLink-foreground);
            border-bottom: 2px solid var(--vscode-panel-border);
            padding-bottom: 10px;
        }
        .metadata {
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            padding: 15px;
            border-radius: 5px;
            margin-bottom: 20px;
        }
        .metadata-item {
            margin: 5px 0;
        }
        .metadata-label {
            font-weight: bold;
            color: var(--vscode-textLink-foreground);
        }
        .content {
            margin-top: 20px;
        }
        .file-mappings {
            margin-top: 20px;
        }
        .file-mappings ul {
            list-style-type: none;
            padding-left: 0;
        }
        .file-mappings li {
            margin: 5px 0;
            padding: 5px;
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 3px;
        }
        a {
            color: var(--vscode-textLink-foreground);
            text-decoration: underline;
            cursor: pointer;
        }
        a:hover {
            color: var(--vscode-textLink-activeForeground);
        }
        code {
            font-family: var(--vscode-editor-font-family);
        }
    </style>
    <script>
        const vscode = acquireVsCodeApi();
        document.addEventListener('DOMContentLoaded', () => {
            document.querySelectorAll('a[data-command]').forEach(link => {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    const command = link.getAttribute('data-command');
                    const argsJson = link.getAttribute('data-args');
                    const args = argsJson ? JSON.parse(argsJson) : [];
                    vscode.postMessage({
                        command: 'executeCommand',
                        commandName: command,
                        args: args
                    });
                });
            });
        });
    </script>
</head>
<body>
    <h1>ADR-${this.escapeHtml(adr.adr_number)}: ${this.escapeHtml(adr.title)}</h1>
    
    <div class="metadata">
        <div class="metadata-item">
            <span class="metadata-label">ADR Number:</span> ${this.escapeHtml(adr.adr_number)}
        </div>
        <div class="metadata-item">
            <span class="metadata-label">Title:</span> ${this.escapeHtml(adr.title)}
        </div>
        <div class="metadata-item">
            <span class="metadata-label">File Name:</span> ${this.escapeHtml(adr.file_name)}
        </div>
        <div class="metadata-item">
            <span class="metadata-label">Content Hash:</span> <code>${this.escapeHtml(adr.content_hash)}</code>
        </div>
        <div class="metadata-item">
            <span class="metadata-label">Created:</span> ${adr.created_at.toLocaleString()}
        </div>
        <div class="metadata-item">
            <span class="metadata-label">Updated:</span> ${adr.updated_at.toLocaleString()}
        </div>
    </div>
    
    <div class="file-mappings">
        <h2>Referenced Files</h2>
        <ul>
            ${filesHtml}
        </ul>
    </div>
    
    <div class="content">
        ${this.markdownToHtml(markdown)}
    </div>
</body>
</html>`;
    }

    /**
     * Generates HTML for dependency detail view.
     */
    private getDependencyHtml(
        dependency: Dependency,
        fromModule: Module | null,
        toModule: Module | null
    ): string {
        const fromModuleCommand = fromModule ? '5d-database.showModuleDetail' : '5d-database.openSourceFile';
        const fromModuleArgs = fromModule ? [fromModule.id] : [dependency.from_module];
        const toModuleCommand = toModule ? '5d-database.showModuleDetail' : '5d-database.openSourceFile';
        const toModuleArgs = toModule ? [toModule.id] : [dependency.to_module];

        let symbolsList = '';
        if (dependency.symbols_json) {
            try {
                const symbols = JSON.parse(dependency.symbols_json);
                if (Array.isArray(symbols) && symbols.length > 0) {
                    symbolsList = `<div class="metadata-item">
                        <span class="metadata-label">Symbols:</span> ${symbols.map(s => `<code>${this.escapeHtml(s)}</code>`).join(', ')}
                    </div>`;
                }
            } catch {
                // Ignore parse errors
            }
        }

        const flags: string[] = [];
        if (dependency.is_type_only) flags.push('type-only');
        if (dependency.is_reexport) flags.push('reexport');
        const flagsStr = flags.length > 0 ? ` [${flags.join(', ')}]` : '';

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dependency: ${this.escapeHtml(dependency.from_module)} → ${this.escapeHtml(dependency.to_module)}</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
        }
        h1 {
            color: var(--vscode-textLink-foreground);
            border-bottom: 2px solid var(--vscode-panel-border);
            padding-bottom: 10px;
        }
        .metadata {
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            padding: 15px;
            border-radius: 5px;
            margin-bottom: 20px;
        }
        .metadata-item {
            margin: 5px 0;
        }
        .metadata-label {
            font-weight: bold;
            color: var(--vscode-textLink-foreground);
        }
        .related {
            margin-top: 20px;
        }
        .related ul {
            list-style-type: none;
            padding-left: 0;
        }
        .related li {
            margin: 5px 0;
            padding: 5px;
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 3px;
        }
        a {
            color: var(--vscode-textLink-foreground);
            text-decoration: underline;
            cursor: pointer;
        }
        a:hover {
            color: var(--vscode-textLink-activeForeground);
        }
        code {
            font-family: var(--vscode-editor-font-family);
        }
    </style>
    <script>
        const vscode = acquireVsCodeApi();
        document.addEventListener('DOMContentLoaded', () => {
            document.querySelectorAll('a[data-command]').forEach(link => {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    const command = link.getAttribute('data-command');
                    const argsJson = link.getAttribute('data-args');
                    const args = argsJson ? JSON.parse(argsJson) : [];
                    vscode.postMessage({
                        command: 'executeCommand',
                        commandName: command,
                        args: args
                    });
                });
            });
        });
    </script>
</head>
<body>
    <h1>Dependency: ${this.escapeHtml(dependency.from_module)} → ${this.escapeHtml(dependency.to_module)}</h1>
    
    <div class="metadata">
        <div class="metadata-item">
            <span class="metadata-label">From Module:</span> 
            <a href="#" data-command="${fromModuleCommand}" data-args="${this.escapeHtml(JSON.stringify(fromModuleArgs))}" style="cursor: pointer;"><code>${this.escapeHtml(dependency.from_module)}</code></a>
            <span style="margin-left: 10px; color: var(--vscode-descriptionForeground);">(click to ${fromModule ? 'view details' : 'open'})</span>
        </div>
        <div class="metadata-item">
            <span class="metadata-label">To Module:</span> 
            <a href="#" data-command="${toModuleCommand}" data-args="${this.escapeHtml(JSON.stringify(toModuleArgs))}" style="cursor: pointer;"><code>${this.escapeHtml(dependency.to_module)}</code></a>
            <span style="margin-left: 10px; color: var(--vscode-descriptionForeground);">(click to ${toModule ? 'view details' : 'open'})</span>
        </div>
        <div class="metadata-item">
            <span class="metadata-label">Type:</span> <code>${this.escapeHtml(dependency.dependency_type)}</code>${flagsStr}
        </div>
        ${symbolsList}
        <div class="metadata-item">
            <span class="metadata-label">Content Hash:</span> <code>${this.escapeHtml(dependency.content_hash)}</code>
        </div>
        <div class="metadata-item">
            <span class="metadata-label">Created:</span> ${dependency.created_at.toLocaleString()}
        </div>
        <div class="metadata-item">
            <span class="metadata-label">Updated:</span> ${dependency.updated_at.toLocaleString()}
        </div>
    </div>
    
    ${fromModule || toModule ? `
    <div class="related">
        <h2>Related Modules</h2>
        <ul>
            ${fromModule ? `<li><a href="#" data-command="${fromModuleCommand}" data-args="${this.escapeHtml(JSON.stringify(fromModuleArgs))}" style="cursor: pointer;">${this.escapeHtml(dependency.from_module)}</a></li>` : ''}
            ${toModule ? `<li><a href="#" data-command="${toModuleCommand}" data-args="${this.escapeHtml(JSON.stringify(toModuleArgs))}" style="cursor: pointer;">${this.escapeHtml(dependency.to_module)}</a></li>` : ''}
        </ul>
    </div>
    ` : ''}
</body>
</html>`;
    }

    /**
     * Generates HTML for change report detail view.
     */
    private getChangeHtml(
        report: ChangeReport,
        symbolChanges: SymbolChange[],
        dependencyChanges: DependencyChange[]
    ): string {
        const symbolChangesHtml = symbolChanges.length > 0
            ? symbolChanges.map(sc => {
                const fileArgs = this.escapeHtml(JSON.stringify([sc.file_path]));
                const changeTypeBadge = sc.change_type === 'added' ? '🟢' : sc.change_type === 'removed' ? '🔴' : '🟡';
                return `<li>
                    ${changeTypeBadge} <strong>${this.escapeHtml(sc.change_type)}</strong>: 
                    <code>${this.escapeHtml(sc.symbol_name)}</code> (${this.escapeHtml(sc.symbol_kind)}) 
                    in <a href="#" data-command="5d-database.openSourceFile" data-args="${fileArgs}" style="cursor: pointer;"><code>${this.escapeHtml(sc.file_path)}</code></a>
                </li>`;
            }).join('\n')
            : '<li><em>No symbol changes</em></li>';

        const dependencyChangesHtml = dependencyChanges.length > 0
            ? dependencyChanges.map(dc => {
                const fromArgs = this.escapeHtml(JSON.stringify([dc.from_module]));
                const toArgs = this.escapeHtml(JSON.stringify([dc.to_module]));
                const changeTypeBadge = dc.change_type === 'added' ? '🟢' : '🔴';
                return `<li>
                    ${changeTypeBadge} <strong>${this.escapeHtml(dc.change_type)}</strong>: 
                    <a href="#" data-command="5d-database.openSourceFile" data-args="${fromArgs}" style="cursor: pointer;"><code>${this.escapeHtml(dc.from_module)}</code></a> 
                    → <a href="#" data-command="5d-database.openSourceFile" data-args="${toArgs}" style="cursor: pointer;"><code>${this.escapeHtml(dc.to_module)}</code></a>
                    [${this.escapeHtml(dc.dependency_type)}]
                </li>`;
            }).join('\n')
            : '<li><em>No dependency changes</em></li>';

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Change Report: ${this.escapeHtml(report.run_type)} - ${report.created_at.toLocaleDateString()}</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
        }
        h1 {
            color: var(--vscode-textLink-foreground);
            border-bottom: 2px solid var(--vscode-panel-border);
            padding-bottom: 10px;
        }
        .metadata {
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            padding: 15px;
            border-radius: 5px;
            margin-bottom: 20px;
        }
        .metadata-item {
            margin: 5px 0;
        }
        .metadata-label {
            font-weight: bold;
            color: var(--vscode-textLink-foreground);
        }
        .changes {
            margin-top: 20px;
        }
        .changes ul {
            list-style-type: none;
            padding-left: 0;
        }
        .changes li {
            margin: 5px 0;
            padding: 8px;
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 3px;
        }
        a {
            color: var(--vscode-textLink-foreground);
            text-decoration: underline;
            cursor: pointer;
        }
        a:hover {
            color: var(--vscode-textLink-activeForeground);
        }
        code {
            font-family: var(--vscode-editor-font-family);
        }
    </style>
    <script>
        const vscode = acquireVsCodeApi();
        document.addEventListener('DOMContentLoaded', () => {
            document.querySelectorAll('a[data-command]').forEach(link => {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    const command = link.getAttribute('data-command');
                    const argsJson = link.getAttribute('data-args');
                    const args = argsJson ? JSON.parse(argsJson) : [];
                    vscode.postMessage({
                        command: 'executeCommand',
                        commandName: command,
                        args: args
                    });
                });
            });
        });
    </script>
</head>
<body>
    <h1>Change Report: ${this.escapeHtml(report.run_type)} - ${report.created_at.toLocaleDateString()}</h1>
    
    <div class="metadata">
        <div class="metadata-item">
            <span class="metadata-label">Run Type:</span> ${this.escapeHtml(report.run_type)}
        </div>
        <div class="metadata-item">
            <span class="metadata-label">Created:</span> ${report.created_at.toLocaleString()}
        </div>
        <div class="metadata-item">
            <span class="metadata-label">Statistics:</span> 
            ${report.parsed_files} parsed, ${report.skipped_files} skipped, ${report.total_dependencies} dependencies
        </div>
        ${report.validation_errors > 0 || report.validation_warnings > 0 ? `
        <div class="metadata-item">
            <span class="metadata-label">Validation:</span> 
            ${report.validation_errors} errors, ${report.validation_warnings} warnings
        </div>
        ` : ''}
    </div>
    
    <div class="changes">
        <h2>Symbol Changes (${symbolChanges.length})</h2>
        <ul>
            ${symbolChangesHtml}
        </ul>
    </div>
    
    <div class="changes">
        <h2>Dependency Changes (${dependencyChanges.length})</h2>
        <ul>
            ${dependencyChangesHtml}
        </ul>
    </div>
</body>
</html>`;
    }

    /**
     * Escapes HTML special characters.
     */
    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /**
     * Converts markdown to HTML (basic conversion).
     * For full markdown support, consider using a markdown library.
     */
    private markdownToHtml(markdown: string): string {
        // Remove HTML comments first (they're for change tracking, not display)
        let html = markdown.replace(/<!--[\s\S]*?-->/g, '');
        
        // Then escape HTML to prevent XSS
        html = this.escapeHtml(html);
        
        // Headers
        html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
        html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
        html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
        
        // Bold
        html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        
        // Italic
        html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
        
        // Code blocks
        html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
        
        // Inline code
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
        
        // Links
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
        
        // Line breaks
        html = html.replace(/\n/g, '<br>');
        
        return html;
    }

    /**
     * Disposes all panels.
     */
    public dispose(): void {
        this.panels.forEach(panel => panel.dispose());
        this.panels.clear();
    }
}

