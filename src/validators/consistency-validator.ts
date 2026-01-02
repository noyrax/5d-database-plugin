import { MultiDbManager } from '../core/multi-db-manager';
import { ModuleRepository } from '../repositories/module-repository';
import { SymbolRepository } from '../repositories/symbol-repository';
import { DependencyRepository } from '../repositories/dependency-repository';
import { AdrRepository } from '../repositories/adr-repository';

/**
 * Validation result for consistency checks.
 */
export interface ConsistencyValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
}

/**
 * Validates cross-dimension consistency.
 * Checks that all references between dimensions are valid.
 */
export class ConsistencyValidator {
    private dbManager: MultiDbManager;

    constructor(dbManager: MultiDbManager) {
        this.dbManager = dbManager;
    }

    /**
     * Validates consistency across all dimensions.
     * 
     * @param pluginId The plugin ID
     * @returns Validation result
     */
    public async validate(pluginId: string): Promise<ConsistencyValidationResult> {
        const errors: string[] = [];
        const warnings: string[] = [];

        await this.validateSymbolModuleLinks(pluginId, errors, warnings);
        await this.validateDependencyModuleLinks(pluginId, errors, warnings);
        await this.validateAdrFileLinks(pluginId, errors, warnings);

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Validates that all symbols reference existing modules.
     */
    private async validateSymbolModuleLinks(
        pluginId: string,
        errors: string[],
        warnings: string[]
    ): Promise<void> {
        const symbolDb = await this.dbManager.getDatabase('Y');
        const moduleDb = await this.dbManager.getDatabase('X');
        
        const symbolRepo = new SymbolRepository(symbolDb);
        const moduleRepo = new ModuleRepository(moduleDb);
        
        const symbols = await symbolRepo.getAll(pluginId);
        const modules = await moduleRepo.getAll(pluginId);
        const modulePaths = new Set(modules.map(m => m.file_path));
        
        for (const symbol of symbols) {
            if (!modulePaths.has(symbol.path)) {
                errors.push(`Symbol ${symbol.symbol_id} references non-existent module ${symbol.path}`);
            }
        }
    }

    /**
     * Validates that all dependencies reference existing modules.
     */
    private async validateDependencyModuleLinks(
        pluginId: string,
        errors: string[],
        warnings: string[]
    ): Promise<void> {
        const depDb = await this.dbManager.getDatabase('Z');
        const moduleDb = await this.dbManager.getDatabase('X');
        
        const depRepo = new DependencyRepository(depDb);
        const moduleRepo = new ModuleRepository(moduleDb);
        
        const dependencies = await depRepo.getAll(pluginId);
        const modules = await moduleRepo.getAll(pluginId);
        const modulePaths = new Set(modules.map(m => m.file_path));
        
        for (const dep of dependencies) {
            if (!modulePaths.has(dep.from_module)) {
                errors.push(`Dependency from non-existent module ${dep.from_module}`);
            }
            if (!modulePaths.has(dep.to_module)) {
                errors.push(`Dependency to non-existent module ${dep.to_module}`);
            }
        }
    }

    /**
     * Validates that all ADR file mappings reference existing modules.
     */
    private async validateAdrFileLinks(
        pluginId: string,
        errors: string[],
        warnings: string[]
    ): Promise<void> {
        const adrDb = await this.dbManager.getDatabase('W');
        const moduleDb = await this.dbManager.getDatabase('X');
        
        const adrRepo = new AdrRepository(adrDb);
        const moduleRepo = new ModuleRepository(moduleDb);
        
        const adrs = await adrRepo.getAll(pluginId);
        const modules = await moduleRepo.getAll(pluginId);
        const modulePaths = new Set(modules.map(m => m.file_path));
        
        for (const adr of adrs) {
            const mappings = await adrRepo.getAdrFileMappings(adr.id);
            for (const mapping of mappings) {
                if (!modulePaths.has(mapping.file_path)) {
                    warnings.push(`ADR ${adr.adr_number} references non-existent file ${mapping.file_path}`);
                }
            }
        }
    }
}

