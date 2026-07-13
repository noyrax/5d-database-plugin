import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { BaseIngestor } from './base-ingestor';
import { Dimension } from '../core/multi-db-manager';
import { MultiDbManager } from '../core/multi-db-manager';
import { ModuleRepository } from '../repositories/module-repository';
import { Module } from '../models/module';
import { AdrRepository } from '../repositories/adr-repository';

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

        // NEW: Capture file metadata from source file
        let lineCount: number | null = null;
        let byteSize: number | null = null;
        
        try {
            const sourceFileFullPath = path.join(workspaceRoot, sourceFilePath);
            if (fs.existsSync(sourceFileFullPath)) {
                const sourceContent = fs.readFileSync(sourceFileFullPath, 'utf-8');
                const lines = sourceContent.split('\n');
                lineCount = lines.length;
                byteSize = Buffer.byteLength(sourceContent, 'utf-8');
            }
        } catch {
            // If source file not found or error reading, leave as null
        }

        const existing = await repository.getByFilePath(sourceFilePath, pluginId);
        const now = new Date();

        const module: Module = {
            id: existing?.id || uuidv4(),
            plugin_id: pluginId,
            file_path: sourceFilePath,
            content_hash: contentHash,
            content_markdown: content,
            line_count: lineCount,
            byte_size: byteSize,
            deleted_at: null,
            created_at: existing?.created_at || now,
            updated_at: now
        };

        if (existing) {
            await repository.update(module);
        } else {
            await repository.create(module);
        }

        // Extract and link relevant ADRs from module documentation
        await this.linkRelevantAdrs(content, sourceFilePath, pluginId);
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

    /**
     * Extracts relevant ADR numbers from module documentation.
     * Parses the "## Relevante ADRs" section and extracts ADR numbers.
     * 
     * @param content The module documentation markdown content
     * @returns Array of ADR numbers (e.g., ["072", "073"])
     */
    private extractRelevantAdrs(content: string): string[] {
        const adrNumbers = new Set<string>();
        const lines = content.split('\n');
        let inAdrSection = false;
        
        for (const line of lines) {
            if (line.trim() === '## Relevante ADRs') {
                inAdrSection = true;
                continue;
            }
            
            if (inAdrSection) {
                // Stop at next section (## or ###)
                if (line.match(/^##/)) {
                    break;
                }
                
                // Extract ADR number: [ADR-072: ...]
                const match = line.match(/\[ADR-(\d+):/);
                if (match) {
                    adrNumbers.add(match[1]);
                }
            }
        }
        
        return Array.from(adrNumbers).sort((a, b) => 
            Number.parseInt(a, 10) - Number.parseInt(b, 10)
        );
    }

    /**
     * Links relevant ADRs to the module by creating file mappings.
     * Extracts ADR numbers from module documentation and creates mappings in adr_file_mappings.
     * 
     * @param content The module documentation markdown content
     * @param sourceFilePath The repository-relative source file path
     * @param pluginId The plugin ID
     */
    private async linkRelevantAdrs(
        content: string,
        sourceFilePath: string,
        pluginId: string
    ): Promise<void> {
        const adrNumbers = this.extractRelevantAdrs(content);
        
        if (adrNumbers.length === 0) {
            return;
        }

        try {
            const adrDb = await this.dbManager.getDatabase('W');
            const adrRepo = new AdrRepository(adrDb);
            
            let mappingCount = 0;
            for (const adrNumber of adrNumbers) {
                const adr = await adrRepo.getByAdrNumber(adrNumber, pluginId);
                if (adr) {
                    try {
                        await adrRepo.createAdrFileMapping({
                            id: uuidv4(),
                            adr_id: adr.id,
                            file_path: sourceFilePath
                        });
                        mappingCount++;
                    } catch (error) {
                        // Ignore duplicate mapping errors (UNIQUE constraint)
                        const errorMsg = error instanceof Error ? error.message : String(error);
                        if (!errorMsg.includes('UNIQUE constraint')) {
                            console.warn(`[ModuleIngestor] Failed to create ADR mapping for ADR-${adrNumber}, file: ${sourceFilePath}: ${errorMsg}`);
                        }
                    }
                } else {
                    console.warn(`[ModuleIngestor] ADR-${adrNumber} not found in database for plugin ${pluginId}`);
                }
            }
            
            if (mappingCount > 0) {
                console.log(`[ModuleIngestor] Created ${mappingCount} ADR mapping(s) for ${sourceFilePath}`);
            }
        } catch (error) {
            // If ADR linking fails, log but don't fail the entire ingestion
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.warn(`[ModuleIngestor] Error linking ADRs for ${sourceFilePath}: ${errorMsg}`);
        }
    }
}

