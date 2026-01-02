import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { BaseIngestor } from './base-ingestor';
import { Dimension } from '../core/multi-db-manager';
import { MultiDbManager } from '../core/multi-db-manager';
import { DependencyRepository } from '../repositories/dependency-repository';
import { Dependency, DependencyGraphCache } from '../models/dependency';

/**
 * Ingests module dependencies from docs/system/DEPENDENCY_GRAPH.md (Z-Dimension)
 * Parses Mermaid graph format: graph TD ... N1 --> N2 ...
 */
export class DependencyIngestor implements BaseIngestor {
    private dbManager: MultiDbManager;

    constructor(dbManager: MultiDbManager) {
        this.dbManager = dbManager;
    }

    public getDimension(): Dimension {
        return 'Z';
    }

    public async ingestFull(workspaceRoot: string, pluginId: string, docsPath: string): Promise<void> {
        if (!docsPath) {
            return;
        }

        const graphFile = path.join(docsPath, 'system', 'DEPENDENCY_GRAPH.md');
        
        if (!fs.existsSync(graphFile)) {
            return;
        }

        const db = await this.dbManager.getDatabase('Z');
        const repository = new DependencyRepository(db);

        const content = fs.readFileSync(graphFile, 'utf-8');
        const mermaidGraph = this.extractMermaidGraph(content);
        
        await repository.setDependencyGraphCache({
            id: uuidv4(),
            plugin_id: pluginId,
            mermaid_graph: mermaidGraph,
            generated_at: new Date()
        });

        const dependencies = this.parseMermaidGraph(mermaidGraph);
        
        for (const dep of dependencies) {
            await this.ingestDependency(dep, pluginId, repository);
        }
    }

    public async ingestIncremental(workspaceRoot: string, pluginId: string, docsPath: string): Promise<void> {
        if (!docsPath) {
            return;
        }

        const graphFile = path.join(docsPath, 'system', 'DEPENDENCY_GRAPH.md');
        
        if (!fs.existsSync(graphFile)) {
            return;
        }

        const db = await this.dbManager.getDatabase('Z');
        const repository = new DependencyRepository(db);

        const content = fs.readFileSync(graphFile, 'utf-8');
        const mermaidGraph = this.extractMermaidGraph(content);
        const contentHash = this.computeContentHash(mermaidGraph);

        const cache = await repository.getDependencyGraphCache(pluginId);
        if (cache) {
            const cacheHash = this.computeContentHash(cache.mermaid_graph);
            if (cacheHash === contentHash) {
                return;
            }
        }

        await repository.setDependencyGraphCache({
            id: cache?.id || uuidv4(),
            plugin_id: pluginId,
            mermaid_graph: mermaidGraph,
            generated_at: new Date()
        });

        const dependencies = this.parseMermaidGraph(mermaidGraph);
        
        for (const dep of dependencies) {
            await this.ingestDependency(dep, pluginId, repository);
        }
    }

    /**
     * Extracts Mermaid graph from markdown file.
     */
    private extractMermaidGraph(content: string): string {
        const mermaidStart = content.indexOf('```mermaid');
        const mermaidEnd = content.indexOf('```', mermaidStart + 11);
        
        if (mermaidStart === -1 || mermaidEnd === -1) {
            return '';
        }

        return content.substring(mermaidStart + 11, mermaidEnd).trim();
    }

    /**
     * Parses Mermaid graph and extracts dependencies.
     * Format: graph TD ... N1["module/path"] ... N1 --> N2 ...
     */
    private parseMermaidGraph(mermaidGraph: string): Array<{ from: string; to: string; type: 'import' | 'export' | 'require' }> {
        const dependencies: Array<{ from: string; to: string; type: 'import' | 'export' | 'require' }> = [];
        const lines = mermaidGraph.split('\n');
        
        const nodeMap = new Map<string, string>();

        for (const line of lines) {
            const trimmed = line.trim();
            
            const nodeDefMatch = trimmed.match(/N(\d+)\["([^"]+)"\]/);
            if (nodeDefMatch) {
                const nodeId = `N${nodeDefMatch[1]}`;
                const modulePath = nodeDefMatch[2];
                nodeMap.set(nodeId, modulePath);
            }
        }

        for (const line of lines) {
            const trimmed = line.trim();
            
            if (trimmed.includes('-->')) {
                const match = trimmed.match(/N(\d+)\s*-->\s*N(\d+)/);
                if (match) {
                    const fromNodeId = `N${match[1]}`;
                    const toNodeId = `N${match[2]}`;
                    
                    const fromModule = nodeMap.get(fromNodeId);
                    const toModule = nodeMap.get(toNodeId);
                    
                    if (fromModule && toModule) {
                        dependencies.push({
                            from: fromModule,
                            to: toModule,
                            type: 'import'
                        });
                    }
                }
            }
        }

        return dependencies;
    }

    /**
     * Ingests a single dependency.
     */
    private async ingestDependency(
        dep: { from: string; to: string; type: 'import' | 'export' | 'require' },
        pluginId: string,
        repository: DependencyRepository
    ): Promise<void> {
        const contentHash = this.computeContentHash(`${dep.from}:${dep.to}:${dep.type}`);
        
        const allDeps = await repository.getAll(pluginId);
        const existing = allDeps.find(d => 
            d.from_module === dep.from && 
            d.to_module === dep.to && 
            d.dependency_type === dep.type
        );

        const now = new Date();
        const dependency: Dependency = {
            id: existing?.id || uuidv4(),
            plugin_id: pluginId,
            from_module: dep.from,
            to_module: dep.to,
            dependency_type: dep.type,
            symbols_json: null,
            content_hash: contentHash,
            is_type_only: false,
            is_reexport: false,
            created_at: existing?.created_at || now,
            updated_at: now
        };

        if (existing) {
            await repository.update(dependency);
        } else {
            await repository.create(dependency);
        }
    }

    /**
     * Computes hash for change detection.
     */
    private computeContentHash(content: string): string {
        return crypto.createHash('sha256').update(content).digest('hex');
    }
}

