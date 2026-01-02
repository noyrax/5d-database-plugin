import * as vscode from 'vscode';
import { MultiDbManager } from '../core/multi-db-manager';
import { SearchApi, SearchResult } from '../api/search-api';
import { SemanticSearchApi } from '../api/semantic-search-api';
import { EmbeddingGenerator } from '../embedding/embedding-generator';
import { DetailViewProvider } from './detail-view-provider';

/**
 * Provider for search functionality using VS Code QuickPick.
 * Uses Semantic Search if available (V-Dimension with embeddings), falls back to Keyword Search.
 */
export class SearchProvider {
    private dbManager: MultiDbManager;
    private searchApi: SearchApi;
    private semanticSearchApi: SemanticSearchApi | null = null;
    private detailViewProvider: DetailViewProvider;
    private pluginId: string;

    constructor(dbManager: MultiDbManager) {
        this.dbManager = dbManager;
        this.searchApi = new SearchApi(dbManager);
        
        // Try to initialize Semantic Search (will be null if embeddings not available)
        try {
            const embeddingGenerator = new EmbeddingGenerator();
            if (embeddingGenerator.isConfigured()) {
                this.semanticSearchApi = new SemanticSearchApi(dbManager, embeddingGenerator);
            }
        } catch (error) {
            // Semantic search not available, will use keyword search
            console.warn('[SearchProvider] Semantic search not available, using keyword search only');
        }
        
        this.detailViewProvider = new DetailViewProvider(dbManager);
        this.pluginId = dbManager.getPluginId();
    }

    /**
     * Shows the search QuickPick.
     */
    public async showSearch(): Promise<void> {
        const query = await vscode.window.showInputBox({
            prompt: 'Search across all 5 dimensions (Modules, Symbols, ADRs, Dependencies, Changes)',
            placeHolder: 'Enter search query...'
        });

        if (!query || query.trim().length === 0) {
            return;
        }

        try {
            let results: SearchResult[] = [];
            
            // Try semantic search first if available
            if (this.semanticSearchApi) {
                try {
                    const semanticResults = await this.semanticSearchApi.search(
                        query.trim(),
                        this.pluginId,
                        { limit: 50 }
                    );
                    
                    // Convert semantic results to SearchResult format
                    results = semanticResults.map(sr => {
                        // Build label based on dimension
                        let label = sr.externalId;
                        let filePath: string | undefined = undefined;
                        
                        // Try to extract meaningful label from externalId
                        if (sr.dimension === 'X') {
                            // Module: externalId is file path
                            label = sr.externalId;
                            filePath = sr.externalId;
                        } else if (sr.dimension === 'Y') {
                            // Symbol: externalId is symbol_id (format: path::symbol_name)
                            const parts = sr.externalId.split('::');
                            if (parts.length >= 2) {
                                label = parts[parts.length - 1]; // symbol name
                                filePath = parts.slice(0, -1).join('::'); // path
                            } else {
                                label = sr.externalId;
                            }
                        } else if (sr.dimension === 'W') {
                            // ADR: externalId is ADR number or file path
                            label = sr.externalId.startsWith('ADR-') ? sr.externalId : `ADR: ${sr.externalId}`;
                        } else {
                            label = sr.externalId;
                        }
                        
                        return {
                            dimension: sr.dimension,
                            id: sr.entityId,
                            label: label,
                            description: `Relevance: ${(sr.score * 100).toFixed(1)}% (Vector: ${(sr.vectorScore * 100).toFixed(1)}%, Importance: ${(sr.importanceScore * 100).toFixed(1)}%)`,
                            filePath: filePath,
                            metadata: {
                                score: sr.score.toString(),
                                vectorScore: sr.vectorScore.toString(),
                                importanceScore: sr.importanceScore.toString()
                            }
                        };
                    });
                    
                    console.log(`[SearchProvider] Semantic search found ${results.length} results`);
                } catch (semanticError) {
                    console.warn(`[SearchProvider] Semantic search failed, falling back to keyword search: ${semanticError}`);
                    // Fall through to keyword search
                }
            }
            
            // Fallback to keyword search if semantic search didn't produce results
            if (results.length === 0) {
                results = await this.searchApi.searchAll(query.trim(), this.pluginId, { limit: 50 });
                console.log(`[SearchProvider] Keyword search found ${results.length} results`);
            }
            
            if (results.length === 0) {
                vscode.window.showInformationMessage(`No results found for "${query}"`);
                return;
            }

            // Group results by dimension
            const groupedResults = this.groupByDimension(results);
            
            // Create QuickPick items
            const items: vscode.QuickPickItem[] = [];
            
            for (const [dimension, dimensionResults] of Object.entries(groupedResults)) {
                // Add dimension header
                items.push({
                    label: `$(folder) ${this.getDimensionLabel(dimension as 'X' | 'Y' | 'Z' | 'W' | 'T')}`,
                    kind: vscode.QuickPickItemKind.Separator
                });
                
                // Add results for this dimension
                for (const result of dimensionResults) {
                    items.push({
                        label: result.label,
                        description: result.description,
                        detail: result.filePath ? `File: ${result.filePath}` : undefined
                    });
                }
            }

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: `Select a result to view details (${results.length} results found)`,
                matchOnDescription: true,
                matchOnDetail: true
            });

            if (selected && selected.kind !== vscode.QuickPickItemKind.Separator) {
                await this.handleResultSelection(selected.label, results);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Search failed: ${error}`);
        }
    }

    /**
     * Groups search results by dimension.
     */
    private groupByDimension(results: SearchResult[]): Record<string, SearchResult[]> {
        const grouped: Record<string, SearchResult[]> = {
            X: [],
            Y: [],
            Z: [],
            W: [],
            T: []
        };

        for (const result of results) {
            grouped[result.dimension].push(result);
        }

        // Remove empty dimensions
        for (const dimension of Object.keys(grouped)) {
            if (grouped[dimension].length === 0) {
                delete grouped[dimension];
            }
        }

        return grouped;
    }

    /**
     * Gets a human-readable label for a dimension.
     */
    private getDimensionLabel(dimension: 'X' | 'Y' | 'Z' | 'W' | 'T'): string {
        const labels: Record<string, string> = {
            X: 'Modules',
            Y: 'Symbols',
            Z: 'Dependencies',
            W: 'ADRs',
            T: 'Changes'
        };
        return labels[dimension] || dimension;
    }

    /**
     * Handles selection of a search result.
     */
    private async handleResultSelection(selectedLabel: string, results: SearchResult[]): Promise<void> {
        const result = results.find(r => r.label === selectedLabel);
        
        if (!result) {
            return;
        }

        switch (result.dimension) {
            case 'X':
                // Module - show detail view
                await this.detailViewProvider.showModuleDetail(result.id);
                break;
            case 'Y':
                // Symbol - show detail view
                await this.detailViewProvider.showSymbolDetail(result.id);
                break;
            case 'W':
                // ADR - show detail view
                await this.detailViewProvider.showAdrDetail(result.id);
                break;
            case 'Z':
                // Dependency - show detail view
                await this.detailViewProvider.showDependencyDetail(result.id);
                break;
            case 'T':
                // Change - show detail view
                await this.detailViewProvider.showChangeDetail(result.id);
                break;
        }
    }
}

