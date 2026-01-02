import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { BaseIngestor } from './base-ingestor';
import { Dimension } from '../core/multi-db-manager';
import { MultiDbManager } from '../core/multi-db-manager';
import { ModuleRepository } from '../repositories/module-repository';
import { Module } from '../models/module';

/**
 * Ingests module documentation from docs/modules/*.md (X-Dimension)
 */
export class ModuleIngestor implements BaseIngestor {
    private dbManager: MultiDbManager;

    constructor(dbManager: MultiDbManager) {
        this.dbManager = dbManager;
    }

    public getDimension(): Dimension {
        return 'X';
    }

    public async ingestFull(workspaceRoot: string, pluginId: string, docsPath: string): Promise<void> {
        if (!docsPath) {
            return;
        }

        const modulesDir = path.join(docsPath, 'modules');
        
        if (!fs.existsSync(modulesDir)) {
            return;
        }

        const db = await this.dbManager.getDatabase('X');
        const repository = new ModuleRepository(db);

        const files = fs.readdirSync(modulesDir)
            .filter(file => file.endsWith('.md'))
            .sort();

        for (const file of files) {
            const filePath = path.join(modulesDir, file);
            await this.ingestModuleFile(filePath, workspaceRoot, pluginId, repository);
        }
    }

    public async ingestIncremental(workspaceRoot: string, pluginId: string, docsPath: string): Promise<void> {
        if (!docsPath) {
            return;
        }

        const modulesDir = path.join(docsPath, 'modules');
        
        if (!fs.existsSync(modulesDir)) {
            return;
        }

        const db = await this.dbManager.getDatabase('X');
        const repository = new ModuleRepository(db);

        const files = fs.readdirSync(modulesDir)
            .filter(file => file.endsWith('.md'))
            .sort();

        for (const file of files) {
            const filePath = path.join(modulesDir, file);
            const sourceFilePath = this.extractSourceFilePath(file, workspaceRoot);
            
            const existing = await repository.getByFilePath(sourceFilePath, pluginId);
            const content = fs.readFileSync(filePath, 'utf-8');
            const contentHash = this.computeContentHash(content);

            if (existing && existing.content_hash === contentHash) {
                continue;
            }

            await this.ingestModuleFile(filePath, workspaceRoot, pluginId, repository);
        }
    }

    /**
     * Ingests a single module file.
     */
    private async ingestModuleFile(
        filePath: string,
        workspaceRoot: string,
        pluginId: string,
        repository: ModuleRepository
    ): Promise<void> {
        const content = fs.readFileSync(filePath, 'utf-8');
        const contentHash = this.computeContentHash(content);
        const sourceFilePath = this.extractSourceFilePath(path.basename(filePath), workspaceRoot);

        const existing = await repository.getByFilePath(sourceFilePath, pluginId);
        const now = new Date();

        const module: Module = {
            id: existing?.id || uuidv4(),
            plugin_id: pluginId,
            file_path: sourceFilePath,
            content_hash: contentHash,
            content_markdown: content,
            deleted_at: null,
            created_at: existing?.created_at || now,
            updated_at: now
        };

        if (existing) {
            await repository.update(module);
        } else {
            await repository.create(module);
        }
    }

    /**
     * Extracts the source file path from a documentation file name.
     * Converts docs/modules/src__core__scanner.ts.md -> src/core/scanner.ts
     */
    private extractSourceFilePath(docFileName: string, workspaceRoot: string): string {
        const baseName = path.basename(docFileName, '.md');
        return baseName.replace(/__/g, '/');
    }

    /**
     * Computes SHA256 hash of content.
     */
    private computeContentHash(content: string): string {
        return crypto.createHash('sha256').update(content).digest('hex');
    }
}

