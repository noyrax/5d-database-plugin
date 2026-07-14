import { MultiDbManager } from '../core/multi-db-manager';
import { EmbeddingGenerator } from './embedding-generator';
import { EmbeddingRepository, Embedding } from '../repositories/embedding-repository';
import { ModuleApi } from '../api/module-api';
import { SymbolApi } from '../api/symbol-api';
import { DependencyApi } from '../api/dependency-api';
import { AdrApi } from '../api/adr-api';
import { ChangeApi } from '../api/change-api';
import { Module } from '../models/module';
import { Symbol } from '../models/symbol';
import { Dependency } from '../models/dependency';
import { Adr } from '../models/adr';
import { ChangeReport, SymbolChange, DependencyChange } from '../models/change';
import { ModuleSummarizer } from './module-summarizer';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';

/**
 * Coordinates embedding generation for all 5 dimensions.
 * Syncs embeddings with 5D-DBs using hash-based change detection.
 */
export class EmbeddingPipeline {
    private dbManager: MultiDbManager;
    private embeddingGenerator: EmbeddingGenerator;
    private moduleApi: ModuleApi;
    private symbolApi: SymbolApi;
    private dependencyApi: DependencyApi;
    private adrApi: AdrApi;
    private changeApi: ChangeApi;
    private moduleSummarizer: ModuleSummarizer;

    constructor(dbManager: MultiDbManager, embeddingGenerator: EmbeddingGenerator) {
        this.dbManager = dbManager;
        this.embeddingGenerator = embeddingGenerator;
        this.moduleApi = new ModuleApi(dbManager);
        this.symbolApi = new SymbolApi(dbManager);
        this.dependencyApi = new DependencyApi(dbManager);
        this.adrApi = new AdrApi(dbManager);
        this.changeApi = new ChangeApi(dbManager);
        this.moduleSummarizer = new ModuleSummarizer();
    }

    /**
     * Syncs embeddings for all dimensions.
     * Only generates embeddings for changed/new entities.
     */
    async syncEmbeddings(pluginId: string): Promise<void> {
        console.log(`[EmbeddingPipeline] Starting embedding sync for plugin ${pluginId}`);

        if (!this.embeddingGenerator.isConfigured()) {
            // Loud, actionable warning: a silent skip here is exactly how a system ends
            // up with a vectors.db that exists but has ZERO embeddings, while readiness
            // checks still report "ready". Make the consequence explicit.
            console.error(
                '[EmbeddingPipeline] ⚠ Embedding provider NOT configured (missing VOYAGE_API_KEY). ' +
                'Skipping embedding sync — semantic_discovery and the V-dimension will return NO results ' +
                'until embeddings are generated. Set VOYAGE_API_KEY in the workspace .env and re-run the ingest.'
            );
            return;
        }

        const model = this.embeddingGenerator.getModel();

        // Sync each dimension
        await this.syncDimension('X', pluginId, model);
        await this.syncDimension('Y', pluginId, model);
        await this.syncDimension('Z', pluginId, model);
        await this.syncDimension('W', pluginId, model);
        await this.syncDimension('T', pluginId, model);

        console.log(`[EmbeddingPipeline] Embedding sync completed for plugin ${pluginId}`);
    }

    /**
     * Syncs embeddings for a specific dimension.
     */
    async syncDimension(
        dimension: 'X' | 'Y' | 'Z' | 'W' | 'T',
        pluginId: string,
        model: string
    ): Promise<void> {
        console.log(`[EmbeddingPipeline] Syncing dimension ${dimension} for plugin ${pluginId}`);

        const db = await this.dbManager.getDatabase('V');
        const embeddingRepo = new EmbeddingRepository(db);

        // Check vector database availability once
        const vectorDb = this.dbManager.getVectorDatabase();
        const vectorDbAvailable = vectorDb && vectorDb.isAvailable();
        
        if (vectorDb) {
            if (vectorDb.isAvailable()) {
                console.log(`[EmbeddingPipeline] Vector database available: ${vectorDb.constructor.name}`);
            } else {
                console.warn(`[EmbeddingPipeline] Vector database initialized but not available. Will use fallback cosine similarity.`);
            }
        } else {
            console.warn(`[EmbeddingPipeline] Vector database not initialized. Embeddings will be stored in SQLite only (fallback to cosine similarity).`);
        }

        // Get all entities from the dimension
        const entities = await this.getEntitiesForDimension(dimension, pluginId);
        console.log(`[EmbeddingPipeline] Found ${entities.length} entities in dimension ${dimension}`);

        // Get existing embeddings
        const existingEmbeddings = await embeddingRepo.getAllByDimension(dimension, pluginId, model);
        const existingMap = new Map<string, Embedding>();
        for (const emb of existingEmbeddings) {
            existingMap.set(emb.entity_id, emb);
        }

        // Find entities that need embedding generation
        const toGenerate: Array<{ entity: any; content: string; contentHash: string }> = [];

        for (const entity of entities) {
            const content = await this.extractContentForEmbedding(dimension, entity);
            
            // Überspringe leere Content (z.B. extrem große Dateien, die nicht embeddet werden können)
            if (!content || content.trim().length === 0) {
                console.warn(`[EmbeddingPipeline] Skipping embedding for entity ${entity.id} in dimension ${dimension} (empty content)`);
                continue;
            }
            
            const contentHash = this.computeContentHash(content);

            const existing = existingMap.get(entity.id);
            if (!existing || existing.content_hash !== contentHash) {
                toGenerate.push({ entity, content, contentHash });
            }
        }

        console.log(`[EmbeddingPipeline] Need to generate ${toGenerate.length} embeddings for dimension ${dimension}`);

        // Generate embeddings in batch for new/changed entities
        if (toGenerate.length > 0) {
            const batchItems = toGenerate.map(item => ({
                dimension,
                entityId: item.entity.id,
                content: item.content
            }));

            const embeddings = await this.embeddingGenerator.generateBatch(batchItems);

            // Save embeddings
            const now = new Date();
            for (const item of toGenerate) {
                const embeddingVector = embeddings.get(item.entity.id);
                if (!embeddingVector) {
                    console.warn(`[EmbeddingPipeline] No embedding generated for entity ${item.entity.id} in dimension ${dimension}`);
                    continue;
                }

                // Convert array to Buffer (1024 floats = 1024 * 4 bytes = 4096 bytes)
                const vectorBuffer = Buffer.from(new Float32Array(embeddingVector).buffer);

                const existing = existingMap.get(item.entity.id);
                const externalId = this.getExternalId(dimension, item.entity);

                let embeddingId: string;
                if (existing) {
                    // Update existing embedding
                    existing.content_hash = item.contentHash;
                    existing.embedding_vector = vectorBuffer;
                    existing.updated_at = now;
                    await embeddingRepo.update(existing);
                    embeddingId = existing.id;
                } else {
                    // Create new embedding
                    const embedding: Embedding = {
                        id: uuidv4(),
                        plugin_id: pluginId,
                        dimension,
                        entity_id: item.entity.id,
                        external_id: externalId,
                        content_hash: item.contentHash,
                        embedding_model: model,
                        embedding_vector: vectorBuffer,
                        created_at: now,
                        updated_at: now
                    };
                    await embeddingRepo.create(embedding);
                    embeddingId = embedding.id;
                }

                // Sync to vector database (VSS or external DB)
                if (vectorDbAvailable) {
                    try {
                        // Convert Buffer to Float32Array for vector database
                        const vectorArray = new Float32Array(
                            vectorBuffer.buffer,
                            vectorBuffer.byteOffset,
                            vectorBuffer.length / 4
                        );
                        await vectorDb!.upsertEmbedding(embeddingId, vectorArray);
                    } catch (vectorDbError) {
                        console.warn(`[EmbeddingPipeline] Failed to sync embedding ${embeddingId} to vector database: ${vectorDbError}`);
                        // Continue - fallback to cosine similarity will be used
                    }
                }
            }

            console.log(`[EmbeddingPipeline] Generated and synced ${toGenerate.length} new/changed embeddings for dimension ${dimension}`);
        }

        // Sync all existing embeddings to vector database (if vector DB is available)
        // This ensures that even if embeddings were created before ChromaDB was available,
        // they get synchronized when ChromaDB becomes available
        if (vectorDbAvailable && existingEmbeddings.length > 0) {
            console.log(`[EmbeddingPipeline] Syncing ${existingEmbeddings.length} existing embeddings to vector database for dimension ${dimension}`);
            let syncedCount = 0;
            let failedCount = 0;

            for (const embedding of existingEmbeddings) {
                try {
                    // Convert Buffer to Float32Array
                    const vectorBuffer = embedding.embedding_vector;
                    const vectorArray = new Float32Array(
                        vectorBuffer.buffer,
                        vectorBuffer.byteOffset,
                        vectorBuffer.length / 4
                    );
                    await vectorDb!.upsertEmbedding(embedding.id, vectorArray);
                    syncedCount++;
                } catch (vectorDbError) {
                    console.warn(`[EmbeddingPipeline] Failed to sync existing embedding ${embedding.id} to vector database: ${vectorDbError}`);
                    failedCount++;
                }
            }

            console.log(`[EmbeddingPipeline] Synced ${syncedCount} existing embeddings to vector database for dimension ${dimension} (${failedCount} failed)`);
        }
    }

    /**
     * Gets all entities for a dimension.
     */
    private async getEntitiesForDimension(
        dimension: 'X' | 'Y' | 'Z' | 'W' | 'T',
        pluginId: string
    ): Promise<any[]> {
        switch (dimension) {
            case 'X':
                return await this.moduleApi.getAllModules(pluginId);
            case 'Y':
                return await this.symbolApi.getAllSymbols(pluginId);
            case 'Z':
                return await this.dependencyApi.getAllDependencies(pluginId);
            case 'W':
                return await this.adrApi.getAllAdrs(pluginId);
            case 'T':
                // For T-dimension, we use the latest change report
                const latestReport = await this.changeApi.getLatestChangeReport(pluginId);
                return latestReport ? [latestReport] : [];
        }
    }

    /**
     * Extracts content for embedding based on dimension.
     */
    private async extractContentForEmbedding(dimension: 'X' | 'Y' | 'Z' | 'W' | 'T', entity: any): Promise<string> {
        switch (dimension) {
            case 'X': {
                // X (Modules): Full markdown content
                const module = entity as Module;
                let content = module.content_markdown;
                
                // TOKEN-LIMIT-CHECK: Voyage voyage-3.5 erlaubt 32K Token; wir bleiben konservativ.
                const tokenEstimate = this.estimateTokens(content);
                const maxTokens = 8000; // Konservatives Limit (weit unter Voyage 32K)
                
                if (tokenEstimate > maxTokens) {
                    console.warn(`[EmbeddingPipeline] Large module documentation: ${module.file_path} (~${tokenEstimate} tokens, max ${maxTokens})`);
                    
                    // Für extrem große Dateien (>15000 Tokens): Verwende hierarchical Strategie automatisch
                    if (tokenEstimate > 15000) {
                        console.warn(`[EmbeddingPipeline] Extremely large module (>15000 tokens), using hierarchical strategy`);
                        content = this.extractModuleStructure(content);
                        const newTokenEstimate = this.estimateTokens(content);
                        if (newTokenEstimate > maxTokens) {
                            console.error(`[EmbeddingPipeline] Module still too large after hierarchical extraction (~${newTokenEstimate} tokens). Skipping embedding.`);
                            // Überspringe Embedding für diese Datei - gib leeren String zurück
                            return '';
                        }
                        return content;
                    }
                    
                    // STRATEGIE-AUSWAHL: Intelligente Kürzung, Hierarchische Embeddings, oder Summarization
                    const strategy = process.env.EMBEDDING_STRATEGY || 'optimize';
                    
                    if (strategy === 'summarize' && this.moduleSummarizer.isConfigured()) {
                        console.warn(`[EmbeddingPipeline] Using LLM-based summarization strategy...`);
                        try {
                            content = await this.moduleSummarizer.summarizeModuleContent(content, module.file_path);
                            const newTokenEstimate = this.estimateTokens(content);
                            console.log(`[EmbeddingPipeline] Summarized to ~${newTokenEstimate} tokens`);
                        } catch (error) {
                            console.error(`[EmbeddingPipeline] Summarization failed, falling back to optimization: ${error}`);
                            content = this.optimizeModuleContentForEmbedding(content, maxTokens);
                        }
                    } else if (strategy === 'hierarchical') {
                        console.warn(`[EmbeddingPipeline] Using hierarchical embedding strategy...`);
                        content = this.extractModuleStructure(content);
                    } else {
                        console.warn(`[EmbeddingPipeline] Optimizing content for embedding...`);
                        content = this.optimizeModuleContentForEmbedding(content, maxTokens);
                    }
                }
                
                return content;
            }
            case 'Y': {
                // Y (Symbols): {name} {signature} {dependencies_summary}
                const symbol = entity as Symbol;
                const signature = JSON.parse(symbol.signature_json || '{}');
                const signatureStr = JSON.stringify(signature, null, 2);
                const summary = symbol.summary || '';
                return `${symbol.name}\n${signatureStr}\n${summary}`;
            }
            case 'Z': {
                // Z (Dependencies): {from_module} → {to_module} {dependency_type} {symbols_summary}
                const dep = entity as Dependency;
                const symbols = dep.symbols_json ? JSON.parse(dep.symbols_json) : [];
                const symbolsStr = symbols.length > 0 ? ` (${symbols.join(', ')})` : '';
                return `${dep.from_module} → ${dep.to_module} [${dep.dependency_type}]${symbolsStr}`;
            }
            case 'W': {
                // W (ADRs): {title} {content} {linked_files}
                const adr = entity as Adr;
                
                // Get file mappings from database (instead of regex pattern matching)
                const adrDb = await this.dbManager.getDatabase('W');
                const { AdrRepository } = await import('../repositories/adr-repository');
                const adrRepo = new AdrRepository(adrDb);
                const fileMappings = await adrRepo.getAdrFileMappings(adr.id);
                
                // Structured file list
                const filesStr = fileMappings.length > 0 
                    ? `\n\nLinked files: ${fileMappings.map(m => m.file_path).join(', ')}`
                    : '';
                
                return `${adr.title}\n${adr.content_markdown}${filesStr}`;
            }
            case 'T': {
                // T (Changes): {run_type} {symbol_changes} {dependency_changes}
                const report = entity as ChangeReport;
                // For T-dimension, we'd need to fetch symbol and dependency changes
                // For now, use report metadata
                return `Change Report: ${report.run_type}\nParsed: ${report.parsed_files} files\nDependencies: ${report.total_dependencies}`;
            }
        }
    }

    /**
     * Gets external ID for an entity.
     */
    private getExternalId(dimension: 'X' | 'Y' | 'Z' | 'W' | 'T', entity: any): string {
        switch (dimension) {
            case 'X':
                return (entity as Module).file_path;
            case 'Y':
                return (entity as Symbol).symbol_id;
            case 'Z':
                const dep = entity as Dependency;
                return `${dep.from_module} → ${dep.to_module}`;
            case 'W':
                return (entity as Adr).adr_number;
            case 'T':
                return (entity as ChangeReport).id;
        }
    }

    /**
     * Computes content hash for change detection.
     */
    private computeContentHash(content: string): string {
        return crypto.createHash('sha256').update(content).digest('hex');
    }

    /**
     * Estimates token count from content length (Markdown-optimized).
     * Markdown has different token densities:
     * - Code blocks: ~3 chars/token (more tokens per char due to formatting)
     * - Normal text: ~4 chars/token (standard estimate)
     * - Tables: ~2.5 chars/token (many separators increase token count)
     */
    private estimateTokens(content: string): number {
        // Match code blocks (```...```)
        const codeBlockMatches = content.match(/```[\s\S]*?```/g) || [];
        const codeBlockLength = codeBlockMatches.reduce((sum, block) => sum + block.length, 0);
        
        // Match table rows (|...|)
        const tableMatches = content.match(/\|.*\|/g) || [];
        const tableLength = tableMatches.reduce((sum, line) => sum + line.length, 0);
        
        // Normal text (everything else)
        const normalLength = content.length - codeBlockLength - tableLength;
        
        // Calculate tokens for each type
        const codeTokens = Math.ceil(codeBlockLength / 3); // Code blocks: ~3 chars/token
        const tableTokens = Math.ceil(tableLength / 2.5); // Tables: ~2.5 chars/token
        const normalTokens = Math.ceil(normalLength / 4); // Normal text: ~4 chars/token
        
        return codeTokens + tableTokens + normalTokens;
    }

    /**
     * Optimizes module documentation for embedding while preserving semantic meaning.
     * Strategy: Keep structure and important information, remove detailed tables.
     * Aggressively truncates code blocks to signatures only, limits table rows.
     * 
     * @param content Full markdown content
     * @param maxTokens Maximum tokens allowed
     * @returns Optimized content
     */
    private optimizeModuleContentForEmbedding(content: string, maxTokens: number): string {
        const lines = content.split('\n');
        const optimized: string[] = [];
        let currentTokens = 0;
        const maxTokensWithMargin = maxTokens * 0.95; // 5% Margin für Sicherheit
        
        let inCodeBlock = false;
        let codeBlockStartLine = -1;
        let codeBlockOpener = '';
        let interfaceCount = 0;
        let methodCount = 0;
        let tableRowCount = 0;
        let tableHeaderSkipped = false;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineTokens = this.estimateTokens(line);
            
            // Prüfe Token-Anzahl während Iteration (frühe Kürzung)
            if (currentTokens + lineTokens > maxTokensWithMargin) {
                // Versuche bei logischem Punkt zu kürzen
                if (inCodeBlock) {
                    // Kürze Code-Block: Behalte nur erste Zeile (Signatur)
                    if (codeBlockStartLine >= 0 && i > codeBlockStartLine) {
                        const codeBlockLines = lines.slice(codeBlockStartLine + 1, i);
                        const firstLine = codeBlockLines.find(l => l.trim() && !l.startsWith('```'));
                        if (firstLine) {
                            optimized.push(codeBlockOpener);
                            optimized.push(firstLine);
                            optimized.push('```');
                            currentTokens += this.estimateTokens(codeBlockOpener + '\n' + firstLine + '\n```');
                        }
                    }
                    inCodeBlock = false;
                    codeBlockStartLine = -1;
                }
                // Füge Truncation-Marker hinzu
                optimized.push('\n[... content optimized for embedding - truncated to fit token limit ...]');
                break;
            }
            
            // Behalte Header (wichtig für Struktur)
            if (line.startsWith('#') || line.startsWith('##')) {
                optimized.push(line);
                currentTokens += lineTokens;
                continue;
            }
            
            // Behalte Interface/Method-Namen (wichtig für Semantic Search)
            if (line.startsWith('### interface:') || line.startsWith('### method:') || line.startsWith('### class:') || line.startsWith('### variable:')) {
                optimized.push(line);
                currentTokens += lineTokens;
                if (line.includes('interface:')) interfaceCount++;
                if (line.includes('method:')) methodCount++;
                tableRowCount = 0;
                tableHeaderSkipped = false;
                continue;
            }
            
            // Code-Blöcke: Behalte nur erste Zeile (Signatur)
            if (line.startsWith('```')) {
                if (!inCodeBlock) {
                    // Code-Block startet
                    inCodeBlock = true;
                    codeBlockStartLine = i;
                    codeBlockOpener = line;
                    optimized.push(line); // Behalte ``` opener
                    currentTokens += lineTokens;
                } else {
                    // Code-Block endet
                    inCodeBlock = false;
                    optimized.push(line); // Behalte ``` closer
                    currentTokens += lineTokens;
                    codeBlockStartLine = -1;
                }
                continue;
            }
            
            if (inCodeBlock) {
                // In Code-Block: Behalte nur erste Zeile (Signatur)
                if (codeBlockStartLine === i - 1) {
                    // Erste Zeile nach ``` opener
                    optimized.push(line);
                    currentTokens += lineTokens;
                }
                // Überspringe weitere Zeilen im Code-Block
                continue;
            }
            
            // Tabellen: Aggressiver kürzen (max. 3 Zeilen pro Tabelle)
            if (line.startsWith('|')) {
                if (line.includes('---')) {
                    // Tabellen-Separator: Behalte
                    optimized.push(line);
                    currentTokens += lineTokens;
                    tableRowCount = 0;
                    tableHeaderSkipped = false;
                } else {
                    // Tabellen-Zeile: Überspringe nach 3 Zeilen
                    if (tableRowCount < 3) {
                        optimized.push(line);
                        currentTokens += lineTokens;
                        tableRowCount++;
                    }
                    // Überspringe weitere Zeilen
                }
                continue;
            }
            
            // Behalte wichtige Kommentare (change markers)
            if (line.trim().startsWith('<!--') && line.includes('change:')) {
                optimized.push(line);
                currentTokens += lineTokens;
                continue;
            }
            
            // Behalte leere Zeilen (Struktur)
            if (line.trim() === '') {
                optimized.push(line);
                continue;
            }
            
            // Für sehr große Dokumentationen: Überspringe normale Text-Zeilen
            if (interfaceCount > 20 || methodCount > 50) {
                // Überspringe normale Text-Zeilen (nicht Header, nicht Code, nicht Tabellen)
                continue;
            }
            
            // Behalte alle anderen Zeilen
            optimized.push(line);
            currentTokens += lineTokens;
        }
        
        const optimizedContent = optimized.join('\n');
        const finalTokens = this.estimateTokens(optimizedContent);
        
        // Finale Prüfung: Falls immer noch zu groß, kürze aggressiv
        if (finalTokens > maxTokens) {
            const maxChars = maxTokens * 3; // Konservativ: 3 chars/token
            const truncated = optimizedContent.substring(0, maxChars);
            return truncated + '\n\n[... content optimized for embedding - final truncation ...]';
        }
        
        return optimizedContent;
    }

    /**
     * Extracts only the structure of a module (header, interface/method names, signatures).
     * Used for hierarchical embeddings where details are in Y-Dimension (Symbols).
     * Only keeps: Headers, interface/method/class/variable names, first line of code blocks (signatures).
     * Removes: All tables, code block bodies, normal text.
     * 
     * @param content Full markdown content
     * @returns Module structure (header + names + signatures, no details)
     */
    private extractModuleStructure(content: string): string {
        const lines = content.split('\n');
        const structure: string[] = [];
        
        let inCodeBlock = false;
        let codeBlockOpener = '';
        let codeBlockFirstLine: string | null = null;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Behalte alle Header
            if (line.startsWith('#') || line.startsWith('##') || line.startsWith('###')) {
                structure.push(line);
                continue;
            }
            
            // Code-Blöcke: Behalte nur erste Zeile (Signatur)
            if (line.startsWith('```')) {
                if (inCodeBlock) {
                    // Ende des Code-Blocks: Behalte nur erste Zeile (Signatur)
                    if (codeBlockFirstLine !== null) {
                        structure.push(codeBlockOpener);
                        structure.push(codeBlockFirstLine);
                        structure.push('```');
                    }
                    codeBlockFirstLine = null;
                    inCodeBlock = false;
                } else {
                    // Code-Block startet
                    inCodeBlock = true;
                    codeBlockOpener = line;
                }
                continue;
            }
            
            if (inCodeBlock) {
                // In Code-Block: Behalte nur erste Zeile (Signatur)
                if (codeBlockFirstLine === null && line.trim() && !line.startsWith('```')) {
                    codeBlockFirstLine = line;
                }
                // Überspringe weitere Zeilen im Code-Block
                continue;
            }
            
            // Überspringe Tabellen komplett (Details sind in Y-Dimension)
            if (line.startsWith('|')) {
                continue;
            }
            
            // Behalte wichtige Kommentare (change markers, etc.)
            if (line.trim().startsWith('<!--') && line.includes('change:')) {
                structure.push(line);
                continue;
            }
            
            // Behalte leere Zeilen für Struktur (max. 2 aufeinanderfolgende)
            if (line.trim() === '') {
                const lastLine = structure[structure.length - 1];
                if (lastLine && lastLine.trim() === '') {
                    // Bereits eine leere Zeile, überspringe weitere
                    continue;
                }
                structure.push(line);
                continue;
            }
            
            // Überspringe alle anderen Details (normaler Text, Beschreibungen, etc.)
        }
        
        return structure.join('\n');
    }
}


