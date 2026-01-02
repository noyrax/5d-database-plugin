import * as vscode from 'vscode';
import { MultiDbManager } from '../core/multi-db-manager';

/**
 * Status Bar Provider for 5D Database Plugin.
 * Shows plugin status in the VS Code status bar.
 */
export class StatusBarProvider {
    private statusBarItem: vscode.StatusBarItem;
    private dbManager: MultiDbManager;

    constructor(context: vscode.ExtensionContext, dbManager: MultiDbManager) {
        this.dbManager = dbManager;
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.statusBarItem.command = '5d-database.ingest';
        this.statusBarItem.text = '$(database) 5D DB';
        this.statusBarItem.tooltip = '5D Database Plugin - Click to ingest documentation';
        this.statusBarItem.show();
        
        context.subscriptions.push(this.statusBarItem);
    }

    /**
     * Updates the status bar with current status.
     */
    public updateStatus(status: 'ready' | 'ingesting' | 'error'): void {
        switch (status) {
            case 'ready':
                this.statusBarItem.text = '$(database) 5D DB';
                this.statusBarItem.backgroundColor = undefined;
                break;
            case 'ingesting':
                this.statusBarItem.text = '$(sync~spin) 5D DB Ingesting...';
                this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
                break;
            case 'error':
                this.statusBarItem.text = '$(error) 5D DB Error';
                this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
                break;
        }
    }

    dispose(): void {
        this.statusBarItem.dispose();
    }
}

