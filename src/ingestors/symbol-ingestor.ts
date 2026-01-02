import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { BaseIngestor } from './base-ingestor';
import { Dimension } from '../core/multi-db-manager';
import { MultiDbManager } from '../core/multi-db-manager';
import { SymbolRepository } from '../repositories/symbol-repository';
import { Symbol, SymbolDependency } from '../models/symbol';

/**
 * Ingests symbols from docs/index/symbols.jsonl (Y-Dimension)
 */
export class SymbolIngestor implements BaseIngestor {
    private dbManager: MultiDbManager;

    constructor(dbManager: MultiDbManager) {
        this.dbManager = dbManager;
    }

    public getDimension(): Dimension {
        return 'Y';
    }

    public async ingestFull(workspaceRoot: string, pluginId: string, docsPath: string): Promise<void> {
        if (!docsPath) {
            return;
        }

        const symbolsFile = path.join(docsPath, 'index', 'symbols.jsonl');
        
        if (!fs.existsSync(symbolsFile)) {
            return;
        }

        const db = await this.dbManager.getDatabase('Y');
        const repository = new SymbolRepository(db);

        const content = fs.readFileSync(symbolsFile, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim().length > 0);

        for (const line of lines) {
            try {
                const symbolData = JSON.parse(line);
                await this.ingestSymbol(symbolData, pluginId, repository);
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                throw new Error(`Failed to ingest symbol from line: ${line.substring(0, 100)}... Error: ${errorMsg}`);
            }
        }
    }

    public async ingestIncremental(workspaceRoot: string, pluginId: string, docsPath: string): Promise<void> {
        if (!docsPath) {
            return;
        }

        const symbolsFile = path.join(docsPath, 'index', 'symbols.jsonl');
        
        if (!fs.existsSync(symbolsFile)) {
            return;
        }

        const db = await this.dbManager.getDatabase('Y');
        const repository = new SymbolRepository(db);

        const content = fs.readFileSync(symbolsFile, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim().length > 0);

        for (const line of lines) {
            try {
                const symbolData = JSON.parse(line);
                const symbolId = symbolData.symbol_id || symbolData.id;
                if (!symbolId) {
                    console.warn(`Skipping symbol with missing symbol_id: ${line.substring(0, 100)}...`);
                    continue;
                }
                const existing = await repository.getBySymbolId(symbolId, pluginId);
                const signatureHash = this.computeSignatureHash(symbolData);

                if (existing && existing.signature_hash === signatureHash) {
                    continue;
                }

                await this.ingestSymbol(symbolData, pluginId, repository);
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                throw new Error(`Failed to ingest symbol from line: ${line.substring(0, 100)}... Error: ${errorMsg}`);
            }
        }
    }

    /**
     * Ingests a single symbol from JSONL data.
     */
    private async ingestSymbol(
        symbolData: any,
        pluginId: string,
        repository: SymbolRepository
    ): Promise<void> {
        // Validate required fields
        const symbolId = symbolData.symbol_id || symbolData.id;
        if (!symbolId) {
            throw new Error(`Symbol missing required field 'symbol_id' or 'id': ${JSON.stringify(symbolData)}`);
        }
        if (!symbolData.path) {
            throw new Error(`Symbol missing required field 'path': ${JSON.stringify(symbolData)}`);
        }
        if (!symbolData.kind) {
            throw new Error(`Symbol missing required field 'kind': ${JSON.stringify(symbolData)}`);
        }
        if (!symbolData.name) {
            throw new Error(`Symbol missing required field 'name': ${JSON.stringify(symbolData)}`);
        }

        const signatureHash = this.computeSignatureHash(symbolData);
        const existing = await repository.getBySymbolId(symbolId, pluginId);
        const now = new Date();

        const symbol: Symbol = {
            id: existing?.id || uuidv4(),
            plugin_id: pluginId,
            symbol_id: symbolId,
            path: symbolData.path,
            kind: symbolData.kind,
            name: symbolData.name,
            signature_json: JSON.stringify(symbolData.signature || {}),
            signature_hash: signatureHash,
            summary: symbolData.summary || null,
            deleted_at: null,
            created_at: existing?.created_at || now,
            updated_at: now
        };

        if (existing) {
            await repository.update(symbol);
        } else {
            await repository.create(symbol);
        }

        if (symbolData.dependencies && Array.isArray(symbolData.dependencies)) {
            for (const dep of symbolData.dependencies) {
                await this.ingestSymbolDependency(symbol.id, dep, repository);
            }
        }
    }

    /**
     * Ingests a symbol dependency.
     */
    private async ingestSymbolDependency(
        symbolId: string,
        dep: any,
        repository: SymbolRepository
    ): Promise<void> {
        const dependency: SymbolDependency = {
            id: uuidv4(),
            symbol_id: symbolId,
            dependency_module: dep.module || '',
            dependency_symbols_json: dep.symbols ? JSON.stringify(dep.symbols) : null,
            is_type_only: dep.is_type_only || false,
            is_reexport: dep.is_reexport || false
        };

        await repository.createSymbolDependency(dependency);
    }

    /**
     * Computes hash of symbol signature for change detection.
     */
    private computeSignatureHash(symbolData: any): string {
        const signatureData = {
            signature: symbolData.signature,
            dependencies: symbolData.dependencies
        };
        return crypto.createHash('sha256')
            .update(JSON.stringify(signatureData))
            .digest('hex');
    }
}

