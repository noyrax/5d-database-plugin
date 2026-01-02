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

    constructor(dbManager: MultiDbManager, embeddingGenerator: EmbeddingGenerator) {
        this.dbManager = dbManager;
        this.embeddingGenerator = embeddingGenerator;
        this.moduleApi = new ModuleApi(dbManager);
        this.symbolApi = new SymbolApi(dbManager);
        this.dependencyApi = new DependencyApi(dbManager);
        this.adrApi = new AdrApi(dbManager);
        this.changeApi = new ChangeApi(dbManager);
    }

    /**
     * Syncs embeddings for all dimensions.
     * Only generates embeddings for changed/new entities.
     */
    async syncEmbeddings(pluginId: string): Promise<void> {
        console.log(`[EmbeddingPipeline] Starting embedding sync for plugin ${pluginId}`);

        if (!this.embeddingGenerator.isConfigured()) {
            console.warn('[EmbeddingPipeline] Embedding generator not configured. Skipping sync.');
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
            const content = this.extractContentForEmbedding(dimension, entity);
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

                // Convert array to Buffer (1536 floats = 1536 * 4 bytes = 6144 bytes)
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
    private extractContentForEmbedding(dimension: 'X' | 'Y' | 'Z' | 'W' | 'T', entity: any): string {
        switch (dimension) {
            case 'X': {
                // X (Modules): Full markdown content
                const module = entity as Module;
                return module.content_markdown;
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
                // Extract linked files from content (simple pattern matching)
                const fileMatches = adr.content_markdown.match(/src\/[^\s\)]+/g) || [];
                const filesStr = fileMatches.length > 0 ? `\nLinked files: ${fileMatches.join(', ')}` : '';
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
}


