import { MultiDbManager } from '../core/multi-db-manager';
import { IdMapper } from '../core/id-mapper';
import { ModuleRepository } from '../repositories/module-repository';
import { SymbolRepository } from '../repositories/symbol-repository';
import { AdrRepository } from '../repositories/adr-repository';
import { EntityReference } from '../models/entity-reference';

/**
 * Links entities across dimensions using external IDs.
 * Resolves cross-dimension references (e.g., symbol_id → module_id).
 */
export class CrossDimensionLinker {
    private dbManager: MultiDbManager;
    private idMapper: IdMapper;

    constructor(dbManager: MultiDbManager, idMapper: IdMapper) {
        this.dbManager = dbManager;
        this.idMapper = idMapper;
    }

    /**
     * Resolves a symbol ID to its module reference.
     * 
     * @param symbolId External symbol ID (e.g., ts://src/core/scanner.ts#scanWorkspace(...))
     * @param pluginId The plugin ID
     * @returns Entity reference to the module, or null if not found
     */
    public async resolveSymbolToModule(
        symbolId: string,
        pluginId: string
    ): Promise<EntityReference | null> {
        const symbolDb = await this.dbManager.getDatabase('Y');
        const symbolRepo = new SymbolRepository(symbolDb);
        
        const symbol = await symbolRepo.getBySymbolId(symbolId, pluginId);
        if (!symbol) {
            return null;
        }

        const moduleDb = await this.dbManager.getDatabase('X');
        const moduleRepo = new ModuleRepository(moduleDb);
        
        const module = await moduleRepo.getByFilePath(symbol.path, pluginId);
        if (!module) {
            return null;
        }

        return {
            dimension: 'X',
            entity_id: module.id,
            external_id: `${pluginId}:${module.file_path}`
        };
    }

    /**
     * Resolves an ADR number to its entity reference.
     * 
     * @param adrNumber External ADR number (e.g., "020")
     * @param pluginId The plugin ID
     * @returns Entity reference to the ADR, or null if not found
     */
    public async resolveAdrNumber(
        adrNumber: string,
        pluginId: string
    ): Promise<EntityReference | null> {
        const adrDb = await this.dbManager.getDatabase('W');
        const adrRepo = new AdrRepository(adrDb);
        
        const adr = await adrRepo.getByAdrNumber(adrNumber, pluginId);
        if (!adr) {
            return null;
        }

        return {
            dimension: 'W',
            entity_id: adr.id,
            external_id: adr.adr_number
        };
    }

    /**
     * Gets all ADRs that reference a specific file path.
     * 
     * @param filePath Repository-relative source path
     * @param pluginId The plugin ID
     * @returns Array of entity references to ADRs
     */
    public async getAdrsForFilePath(
        filePath: string,
        pluginId: string
    ): Promise<EntityReference[]> {
        const adrDb = await this.dbManager.getDatabase('W');
        const adrRepo = new AdrRepository(adrDb);
        
        // Try exact match first
        const direct = await adrRepo.findByFilePath(filePath, pluginId);
        if (direct.length > 0) {
            return direct
                .map(adr => ({
                    dimension: 'W' as const,
                    entity_id: adr.id,
                    external_id: adr.adr_number
                }))
                .sort((a, b) => a.external_id.localeCompare(b.external_id));
        }

        // Fallback: normalize path variants (Cross-Analysis previously bypassed AdrApi normalization)
        const variants = this.normalizeFilePath(filePath);
        const foundById = new Map<string, { adr_number: string; id: string }>();

        for (const variant of variants) {
            const adrs = await adrRepo.findByFilePath(variant, pluginId);
            for (const adr of adrs) {
                if (!foundById.has(adr.id)) {
                    foundById.set(adr.id, { id: adr.id, adr_number: adr.adr_number });
                }
            }
        }

        return Array.from(foundById.values())
            .map(adr => ({
                dimension: 'W' as const,
                entity_id: adr.id,
                external_id: adr.adr_number
            }))
            .sort((a, b) => a.external_id.localeCompare(b.external_id));
    }

    /**
     * Normalizes a file path to generate possible variants for flexible matching.
     * Mirrors the logic used in ModuleApi/AgrApi (forward slashes, optional plugin prefixes).
     */
    private normalizeFilePath(filePath: string): string[] {
        const variants: string[] = [];

        // Normalize separators to forward slashes
        let normalized = filePath.replace(/\\/g, '/');
        variants.push(normalized);

        // Remove leading slashes
        const withoutLeadingSlash = normalized.replace(/^\/+/, '');
        if (withoutLeadingSlash !== normalized) {
            variants.push(withoutLeadingSlash);
        }

        const pluginPrefixes = ['5d-database-plugin/', 'documentation-system-plugin/', 'mcp-server/'];

        // Remove common plugin prefixes
        for (const prefix of pluginPrefixes) {
            if (normalized.startsWith(prefix)) {
                variants.push(normalized.substring(prefix.length));
            }
            if (withoutLeadingSlash.startsWith(prefix)) {
                variants.push(withoutLeadingSlash.substring(prefix.length));
            }
        }

        // Add variants WITH plugin prefixes (if path doesn't already have one)
        const hasPluginPrefix = pluginPrefixes.some(prefix =>
            normalized.startsWith(prefix) || withoutLeadingSlash.startsWith(prefix)
        );
        if (!hasPluginPrefix) {
            for (const prefix of pluginPrefixes) {
                variants.push(`${prefix}${withoutLeadingSlash}`);
                variants.push(`${prefix}${normalized}`);
            }
        }

        return Array.from(new Set(variants));
    }

    /**
     * Gets all symbols for a module.
     * 
     * @param filePath Repository-relative source path
     * @param pluginId The plugin ID
     * @returns Array of entity references to symbols
     */
    public async getSymbolsForModule(
        filePath: string,
        pluginId: string
    ): Promise<EntityReference[]> {
        const symbolDb = await this.dbManager.getDatabase('Y');
        const symbolRepo = new SymbolRepository(symbolDb);
        
        const symbols = await symbolRepo.findByPath(filePath, pluginId);
        
        return symbols.map(symbol => ({
            dimension: 'Y',
            entity_id: symbol.id,
            external_id: symbol.symbol_id
        }));
    }
}

