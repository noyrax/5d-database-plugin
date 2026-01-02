import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { BaseIngestor } from './base-ingestor';
import { Dimension } from '../core/multi-db-manager';
import { MultiDbManager } from '../core/multi-db-manager';
import { AdrRepository } from '../repositories/adr-repository';
import { Adr, AdrFileMapping } from '../models/adr';

/**
 * Ingests ADRs from docs/adr/*.md (W-Dimension)
 */
export class AdrIngestor implements BaseIngestor {
    private dbManager: MultiDbManager;

    constructor(dbManager: MultiDbManager) {
        this.dbManager = dbManager;
    }

    public getDimension(): Dimension {
        return 'W';
    }

    public async ingestFull(workspaceRoot: string, pluginId: string, docsPath: string): Promise<void> {
        if (!docsPath) {
            console.warn('[AdrIngestor] ingestFull: docsPath not provided, skipping ADR ingestion');
            return;
        }

        const adrDir = path.join(docsPath, 'adr');
        
        if (!fs.existsSync(adrDir)) {
            console.warn(`[AdrIngestor] ingestFull: ADR directory not found: ${adrDir}`);
            return;
        }

        const db = await this.dbManager.getDatabase('W');
        const repository = new AdrRepository(db);

        const adrFiles = this.findAdrFilesRecursively(adrDir);
        const files = adrFiles
            .map(f => path.relative(adrDir, f))
            .sort();

        console.log(`[AdrIngestor] ingestFull: Found ${files.length} ADR files in ${adrDir} (recursive search)`);

        let ingested = 0;
        let errors = 0;

        for (const file of files) {
            try {
                const filePath = path.join(adrDir, file);
                const fileName = path.basename(filePath);
                await this.ingestAdrFile(filePath, fileName, workspaceRoot, pluginId, repository);
                ingested++;
            } catch (error) {
                errors++;
                const errorMsg = error instanceof Error ? error.message : String(error);
                console.error(`[AdrIngestor] ingestFull: Failed to ingest ADR file ${file}: ${errorMsg}`);
            }
        }

        console.log(`[AdrIngestor] ingestFull: Completed - ${ingested} ingested, ${errors} errors`);
    }

    public async ingestIncremental(workspaceRoot: string, pluginId: string, docsPath: string): Promise<void> {
        if (!docsPath) {
            console.warn('[AdrIngestor] ingestIncremental: docsPath not provided, skipping ADR ingestion');
            return;
        }

        const adrDir = path.join(docsPath, 'adr');
        
        if (!fs.existsSync(adrDir)) {
            console.warn(`[AdrIngestor] ingestIncremental: ADR directory not found: ${adrDir}`);
            return;
        }

        const db = await this.dbManager.getDatabase('W');
        const repository = new AdrRepository(db);

        const adrFiles = this.findAdrFilesRecursively(adrDir);
        const files = adrFiles
            .map(f => path.relative(adrDir, f))
            .sort();

        console.log(`[AdrIngestor] ingestIncremental: Found ${files.length} ADR files in ${adrDir} (recursive search)`);

        let ingested = 0;
        let skipped = 0;
        let errors = 0;

        for (const file of files) {
            try {
                const filePath = path.join(adrDir, file);
                const fileName = path.basename(filePath);
                const adrNumber = this.extractAdrNumber(fileName);
                
                const existing = await repository.getByAdrNumber(adrNumber, pluginId);
                const content = fs.readFileSync(filePath, 'utf-8');
                const contentHash = this.computeContentHash(content);

                if (existing && existing.content_hash === contentHash) {
                    // Content unchanged, but still update file mappings (they might have changed in extractFileMappings logic)
                    const fileMappings = this.extractFileMappings(content, workspaceRoot);
                    const existingMappings = await repository.getAdrFileMappings(existing.id);
                    const existingPaths = new Set(existingMappings.map(m => m.file_path));
                    const newPaths = new Set(fileMappings);
                    
                    // Check if mappings need update
                    const mappingsChanged = fileMappings.length !== existingMappings.length ||
                        !fileMappings.every(p => existingPaths.has(p)) ||
                        !Array.from(existingPaths).every(p => newPaths.has(p));
                    
                    if (mappingsChanged) {
                        // Delete old mappings and recreate
                        for (const mapping of existingMappings) {
                            await repository.deleteAdrFileMapping(mapping.id);
                        }
                        for (const filePath of fileMappings) {
                            try {
                                await repository.createAdrFileMapping({
                                    id: uuidv4(),
                                    adr_id: existing.id,
                                    file_path: filePath
                                });
                            } catch (error) {
                                const errorMsg = error instanceof Error ? error.message : String(error);
                                if (!errorMsg.includes('UNIQUE constraint')) {
                                    console.warn(`[AdrIngestor] Failed to create file mapping for ADR-${adrNumber}, file: ${filePath}: ${errorMsg}`);
                                }
                            }
                        }
                        console.log(`[AdrIngestor] Updated file mappings for ADR-${adrNumber} (${fileMappings.length} mappings)`);
                        ingested++;
                    } else {
                        skipped++;
                    }
                    continue;
                }

                await this.ingestAdrFile(filePath, fileName, workspaceRoot, pluginId, repository);
                ingested++;
            } catch (error) {
                errors++;
                const errorMsg = error instanceof Error ? error.message : String(error);
                console.error(`[AdrIngestor] ingestIncremental: Failed to ingest ADR file ${file}: ${errorMsg}`);
            }
        }

        console.log(`[AdrIngestor] ingestIncremental: Completed - ${ingested} ingested, ${skipped} skipped, ${errors} errors`);
    }

    /**
     * Ingests a single ADR file.
     */
    private async ingestAdrFile(
        filePath: string,
        fileName: string,
        workspaceRoot: string,
        pluginId: string,
        repository: AdrRepository
    ): Promise<void> {
        const content = fs.readFileSync(filePath, 'utf-8');
        const contentHash = this.computeContentHash(content);
        const adrNumber = this.extractAdrNumber(fileName);
        const title = this.extractTitle(content);

        if (!adrNumber) {
            throw new Error(`Failed to extract ADR number from filename: ${fileName}`);
        }

        const existing = await repository.getByAdrNumber(adrNumber, pluginId);
        const now = new Date();

        const adr: Adr = {
            id: existing?.id || uuidv4(),
            plugin_id: pluginId,
            adr_number: adrNumber,
            title: title,
            file_name: fileName,
            content_markdown: content,
            content_hash: contentHash,
            deleted_at: null,
            created_at: existing?.created_at || now,
            updated_at: now
        };

        if (existing) {
            await repository.update(adr);
            console.log(`[AdrIngestor] Updated ADR-${adrNumber}: ${title}`);
            
            // Delete existing file mappings before recreating (to handle removed/changed paths)
            const existingMappings = await repository.getAdrFileMappings(adr.id);
            for (const mapping of existingMappings) {
                await repository.deleteAdrFileMapping(mapping.id);
            }
        } else {
            await repository.create(adr);
            console.log(`[AdrIngestor] Created ADR-${adrNumber}: ${title}`);
        }

        const fileMappings = this.extractFileMappings(content, workspaceRoot);
        let mappingCount = 0;
        for (const filePath of fileMappings) {
            try {
                await repository.createAdrFileMapping({
                    id: uuidv4(),
                    adr_id: adr.id,
                    file_path: filePath
                });
                mappingCount++;
            } catch (error) {
                // Ignore duplicate mapping errors
                const errorMsg = error instanceof Error ? error.message : String(error);
                if (!errorMsg.includes('UNIQUE constraint')) {
                    console.warn(`[AdrIngestor] Failed to create file mapping for ADR-${adrNumber}, file: ${filePath}: ${errorMsg}`);
                }
            }
        }
        if (mappingCount > 0) {
            console.log(`[AdrIngestor] Created ${mappingCount} file mapping(s) for ADR-${adrNumber}`);
        }
    }

    /**
     * Recursively finds all ADR files (.md) in the given directory and subdirectories.
     * 
     * @param adrDir The ADR directory to search
     * @returns Array of full file paths to ADR files
     */
    private findAdrFilesRecursively(adrDir: string): string[] {
        const files: string[] = [];
        
        function searchDir(dir: string): void {
            if (!fs.existsSync(dir)) {
                return;
            }
            
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                
                if (entry.isDirectory()) {
                    // Recursively search subdirectories
                    searchDir(fullPath);
                } else if (entry.isFile() && entry.name.endsWith('.md')) {
                    // Found an ADR file
                    files.push(fullPath);
                }
            }
        }
        
        searchDir(adrDir);
        return files;
    }

    /**
     * Extracts ADR number from file name (e.g., "020-api-doc-tiefe.md" -> "020").
     */
    private extractAdrNumber(fileName: string): string {
        const match = fileName.match(/^(\d+)-/);
        return match ? match[1] : fileName.replace('.md', '');
    }

    /**
     * Extracts title from ADR content (first # heading).
     */
    private extractTitle(content: string): string {
        const match = content.match(/^#\s+(.+)$/m);
        return match ? match[1].trim() : 'Untitled ADR';
    }

    /**
     * Extracts file path references from ADR content.
     * Looks for patterns like `src/path/file.ts`, `5d-database-plugin/src/path/file.ts`, or `[file.ts](src/path/file.ts)`.
     * Normalizes paths to match database format by checking which format exists in the database.
     */
    private extractFileMappings(content: string, workspaceRoot: string): string[] {
        const filePaths: string[] = [];
        
        // Pattern 1: Backtick patterns: `src/path/file.ts` or `5d-database-plugin/src/path/file.ts`
        // Match group 1: full path including extension
        const backtickPattern = /`([^`]+\.(?:ts|js|tsx|jsx|py|json|yaml|yml|md))`/g;
        let match;
        while ((match = backtickPattern.exec(content)) !== null) {
            const filePath = match[1];
                if (filePath && !filePath.startsWith('http') && !filePath.startsWith('mailto:') && !filePath.startsWith('#')) {
                    let normalizedPath = filePath.trim().replace(/\\/g, '/');
                    const finalPath = this.normalizeFilePath(normalizedPath, workspaceRoot);
                    if (finalPath) {
                        filePaths.push(finalPath);
                    }
                }
        }
        
        // Pattern 2: Markdown link patterns: [file.ts](src/path/file.ts) or [file.ts](5d-database-plugin/src/path/file.ts)
        // Match group 2: URL/path (the actual file path)
        const linkPattern = /\[([^\]]+)\]\(([^)]+\.(?:ts|js|tsx|jsx|py|json|yaml|yml|md))\)/g;
        while ((match = linkPattern.exec(content)) !== null) {
            const filePath = match[2]; // Use the URL part, not the link text
                if (filePath && !filePath.startsWith('http') && !filePath.startsWith('mailto:') && !filePath.startsWith('#')) {
                    let normalizedPath = filePath.trim().replace(/\\/g, '/');
                    const finalPath = this.normalizeFilePath(normalizedPath, workspaceRoot);
                    if (finalPath) {
                        filePaths.push(finalPath);
                    }
                }
        }
        
        // Pattern 3: Direct path patterns in code blocks or text: src/path/file.ts or 5d-database-plugin/src/path/file.ts
        // This is more permissive and catches paths that might be in code examples
        const directPathPattern = /(?:5d-database-plugin\/)?src\/[^\s\)`]+\.(?:ts|js|tsx|jsx|py)/g;
        while ((match = directPathPattern.exec(content)) !== null) {
            const filePath = match[0];
                if (filePath && !filePath.startsWith('http') && !filePath.startsWith('mailto:') && !filePath.startsWith('#')) {
                    let normalizedPath = filePath.trim().replace(/\\/g, '/');
                    const finalPath = this.normalizeFilePath(normalizedPath, workspaceRoot);
                    if (finalPath) {
                        filePaths.push(finalPath);
                    }
                }
        }

        // Remove duplicates and return
        return [...new Set(filePaths)];
    }
    
    /**
     * Normalizes a file path to match database format.
     * Checks if file exists with/without plugin prefix and returns the correct format.
     */
    private normalizeFilePath(filePath: string, workspaceRoot: string): string | null {
        if (!filePath || filePath.length < 3) {
            return null;
        }
        
        // Normalize path: ensure forward slashes, remove leading/trailing whitespace
        let normalizedPath = filePath.trim().replace(/\\/g, '/');
        
        // If path starts with src/ and doesn't have plugin prefix, try to find the correct format
        if (normalizedPath.startsWith('src/') && !normalizedPath.startsWith('5d-database-plugin/')) {
            const withPrefix = `5d-database-plugin/${normalizedPath}`;
            const fullPathWithPrefix = path.join(workspaceRoot, withPrefix);
            const fullPathWithoutPrefix = path.join(workspaceRoot, normalizedPath);
            
            // Check which file actually exists
            if (fs.existsSync(fullPathWithPrefix)) {
                return withPrefix;
            } else if (fs.existsSync(fullPathWithoutPrefix)) {
                return normalizedPath;
            } else {
                // File doesn't exist, but try both variants in database
                // Return the one with prefix (most common case)
                return withPrefix;
            }
        }
        
        // If path already has plugin prefix, check if it exists
        if (normalizedPath.startsWith('5d-database-plugin/')) {
            const fullPath = path.join(workspaceRoot, normalizedPath);
            if (fs.existsSync(fullPath)) {
                return normalizedPath;
            }
        }
        
        return normalizedPath;
    }

    /**
     * Computes SHA256 hash of content.
     */
    private computeContentHash(content: string): string {
        return crypto.createHash('sha256').update(content).digest('hex');
    }
}

