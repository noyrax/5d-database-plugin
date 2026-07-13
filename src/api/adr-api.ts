import * as path from 'path';
import { MultiDbManager } from '../core/multi-db-manager';
import { AdrRepository } from '../repositories/adr-repository';
import { Adr } from '../models/adr';
import { PathNormalizer } from '../core/path-normalizer';

/**
 * API for W-Dimension: ADRs
 */
export class AdrApi {
    private dbManager: MultiDbManager;

    constructor(dbManager: MultiDbManager) {
        this.dbManager = dbManager;
    }

    /**
     * Gets an ADR by ADR number with flexible number normalization.
     * Supports both "1" and "001" formats.
     */
    public async getAdrByNumber(adrNumber: string, pluginId: string): Promise<Adr | null> {
        const db = await this.dbManager.getDatabase('W');
        const repository = new AdrRepository(db);
        
        // Try exact match first
        let adr = await repository.getByAdrNumber(adrNumber, pluginId);
        if (adr) {
            return adr;
        }

        // Normalize ADR number (try with/without leading zeros)
        const normalizedNumbers = this.normalizeAdrNumber(adrNumber);
        
        // Try each normalized variant
        for (const normalized of normalizedNumbers) {
            adr = await repository.getByAdrNumber(normalized, pluginId);
            if (adr) {
                return adr;
            }
        }

        return null;
    }

    /**
     * Normalizes an ADR number to generate possible variants for flexible matching.
     * Returns an array of number variants in order of preference.
     */
    private normalizeAdrNumber(adrNumber: string): string[] {
        const variants: string[] = [];
        
        // Normalize: Remove "ADR-" prefix if present (case-insensitive)
        let normalizedInput = adrNumber.replace(/^ADR-/i, '').trim();
        if (normalizedInput === '') {
            normalizedInput = adrNumber; // Fallback to original if normalization resulted in empty string
        }
        
        // Remove any non-numeric prefix/suffix
        const numericMatch = normalizedInput.match(/(\d+)/);
        if (!numericMatch) {
            return [normalizedInput]; // Return normalized if no number found
        }
        
        const numericPart = numericMatch[1];
        const numValue = parseInt(numericPart, 10);
        
        // Original (normalized)
        variants.push(normalizedInput);
        
        // With leading zeros (3 digits: "001", "020", "042")
        const withLeadingZeros = numValue.toString().padStart(3, '0');
        if (withLeadingZeros !== numericPart) {
            variants.push(normalizedInput.replace(numericPart, withLeadingZeros));
        }
        
        // Without leading zeros (if original had them)
        if (numericPart !== numValue.toString()) {
            variants.push(normalizedInput.replace(numericPart, numValue.toString()));
        }
        
        // Just the number (if original had prefix/suffix)
        if (normalizedInput !== numericPart) {
            variants.push(numericPart);
            variants.push(withLeadingZeros);
            variants.push(numValue.toString());
        }
        
        // Remove duplicates and return
        return Array.from(new Set(variants));
    }

    /**
     * Gets all ADRs for a plugin.
     */
    public async getAllAdrs(pluginId: string): Promise<Adr[]> {
        const db = await this.dbManager.getDatabase('W');
        const repository = new AdrRepository(db);
        return repository.getAll(pluginId);
    }

    /**
     * Gets ADRs by file path with flexible path normalization.
     * Supports various path formats (similar to ModuleApi.getModuleByPath).
     */
    public async getAdrsByFilePath(filePath: string, pluginId: string): Promise<Adr[]> {
        const db = await this.dbManager.getDatabase('W');
        const repository = new AdrRepository(db);
        
        // Try exact match first
        let adrs = await repository.findByFilePath(filePath, pluginId);
        if (adrs.length > 0) {
            return adrs;
        }

        // Generate normalized path variants
        const pathVariants = PathNormalizer.generateLookupVariants(filePath);
        
        // Try each variant
        for (const variant of pathVariants) {
            adrs = await repository.findByFilePath(variant, pluginId);
            if (adrs.length > 0) {
                return adrs;
            }
        }

        return [];
    }

}

