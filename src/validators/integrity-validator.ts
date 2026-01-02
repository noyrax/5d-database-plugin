import { MultiDbManager } from '../core/multi-db-manager';
import { ModuleRepository } from '../repositories/module-repository';
import { SymbolRepository } from '../repositories/symbol-repository';
import { DependencyRepository } from '../repositories/dependency-repository';
import { AdrRepository } from '../repositories/adr-repository';
import { ChangeRepository } from '../repositories/change-repository';

/**
 * Validation result for integrity checks.
 */
export interface IntegrityValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
}

/**
 * Validates data integrity within each dimension.
 * Checks for orphaned records, missing foreign keys, etc.
 */
export class IntegrityValidator {
    private dbManager: MultiDbManager;

    constructor(dbManager: MultiDbManager) {
        this.dbManager = dbManager;
    }

    /**
     * Validates integrity across all dimensions.
     * 
     * @param pluginId The plugin ID
     * @returns Validation result
     */
    public async validate(pluginId: string): Promise<IntegrityValidationResult> {
        const errors: string[] = [];
        const warnings: string[] = [];

        await this.validateModuleIntegrity(pluginId, errors, warnings);
        await this.validateSymbolIntegrity(pluginId, errors, warnings);
        await this.validateDependencyIntegrity(pluginId, errors, warnings);
        await this.validateAdrIntegrity(pluginId, errors, warnings);
        await this.validateChangeIntegrity(pluginId, errors, warnings);

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Validates module integrity.
     */
    private async validateModuleIntegrity(
        pluginId: string,
        errors: string[],
        warnings: string[]
    ): Promise<void> {
        const moduleDb = await this.dbManager.getDatabase('X');
        const moduleRepo = new ModuleRepository(moduleDb);
        
        const modules = await moduleRepo.getAll(pluginId);
        
        for (const module of modules) {
            if (!module.content_hash) {
                errors.push(`Module ${module.file_path} has no content_hash`);
            }
            if (!module.content_markdown) {
                errors.push(`Module ${module.file_path} has no content_markdown`);
            }
        }
    }

    /**
     * Validates symbol integrity.
     */
    private async validateSymbolIntegrity(
        pluginId: string,
        errors: string[],
        warnings: string[]
    ): Promise<void> {
        const symbolDb = await this.dbManager.getDatabase('Y');
        const symbolRepo = new SymbolRepository(symbolDb);
        
        const symbols = await symbolRepo.getAll(pluginId);
        
        for (const symbol of symbols) {
            if (!symbol.signature_hash) {
                errors.push(`Symbol ${symbol.symbol_id} has no signature_hash`);
            }
            if (!symbol.signature_json) {
                errors.push(`Symbol ${symbol.symbol_id} has no signature_json`);
            }
        }
    }

    /**
     * Validates dependency integrity.
     */
    private async validateDependencyIntegrity(
        pluginId: string,
        errors: string[],
        warnings: string[]
    ): Promise<void> {
        const depDb = await this.dbManager.getDatabase('Z');
        const depRepo = new DependencyRepository(depDb);
        
        const dependencies = await depRepo.getAll(pluginId);
        
        for (const dep of dependencies) {
            if (!dep.content_hash) {
                errors.push(`Dependency ${dep.from_module} -> ${dep.to_module} has no content_hash`);
            }
        }
    }

    /**
     * Validates ADR integrity.
     */
    private async validateAdrIntegrity(
        pluginId: string,
        errors: string[],
        warnings: string[]
    ): Promise<void> {
        const adrDb = await this.dbManager.getDatabase('W');
        const adrRepo = new AdrRepository(adrDb);
        
        const adrs = await adrRepo.getAll(pluginId);
        
        for (const adr of adrs) {
            if (!adr.content_hash) {
                errors.push(`ADR ${adr.adr_number} has no content_hash`);
            }
            if (!adr.content_markdown) {
                errors.push(`ADR ${adr.adr_number} has no content_markdown`);
            }
        }
    }

    /**
     * Validates change report integrity.
     */
    private async validateChangeIntegrity(
        pluginId: string,
        errors: string[],
        warnings: string[]
    ): Promise<void> {
        const changeDb = await this.dbManager.getDatabase('T');
        const changeRepo = new ChangeRepository(changeDb);
        
        const reports = await changeRepo.getAll(pluginId);
        
        for (const report of reports) {
            const symbolChanges = await changeRepo.getSymbolChanges(report.id);
            const depChanges = await changeRepo.getDependencyChanges(report.id);
            
            if (symbolChanges.length === 0 && depChanges.length === 0) {
                warnings.push(`Change report ${report.id} has no changes`);
            }
        }
    }
}

