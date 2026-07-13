import * as sqlite3 from 'sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { MultiDbManager } from '../core/multi-db-manager';
import { ReasonCode } from '../models/reason-codes';
import { Evidence, createFactEvidence } from '../models/evidence';
import { createEvidenceSource } from '../models/evidence';

/**
 * Source access contract.
 * Determines whether source code is available and under what constraints.
 */
export interface SourceAccessContract {
    /** Status of source code access */
    status: 'AVAILABLE' | 'UNAVAILABLE' | 'PARTIAL';
    
    /** Type of resolver (how source code is accessed) */
    resolver_type: 'FILESYSTEM' | 'GIT' | 'REMOTE' | 'SNAPSHOT' | null;
    
    /** Workspace root path */
    workspace_root: string | null;
    
    /** Access constraints */
    constraints: {
        max_bytes_per_request: number;
        max_lines_per_request: number;
        max_concurrent_requests: number;
        redactions: string[];
    } | null;
    
    /** Reason codes (when UNAVAILABLE/PARTIAL) */
    reason_codes?: ReasonCode[];
    
    /** When this contract was verified */
    verified_at: string;
    
    /** Evidence grade */
    evidence_grade: 'DETERMINISTIC' | 'INFERRED';
    
    /** Evidence information */
    evidence: Evidence;
}

/**
 * API for managing source access contract.
 * Determines whether source code is available and provides runtime status.
 */
export class SourceAccessContractApi {
    private dbManager: MultiDbManager;

    constructor(dbManager: MultiDbManager) {
        this.dbManager = dbManager;
    }

    /**
     * Get current source access contract.
     * Deterministically checks if workspace root is accessible.
     */
    async getContract(workspaceRoot?: string): Promise<SourceAccessContract> {
        const db = await this.dbManager.getDatabase('V');
        
        // Read from database
        const row = await this.queryOne(db, `
            SELECT * FROM source_access_config WHERE id = 'singleton'
        `);

        if (!row) {
            // No config yet - initialize
            return this.initializeContract(workspaceRoot || this.dbManager.getWorkspaceRoot());
        }

        // Check if contract is uninitialized (migration default value)
        // Uninitialized contract has: status='UNAVAILABLE', workspace_root=null, no reason_codes
        const isUninitialized = row.status === 'UNAVAILABLE' && 
                                !row.workspace_root && 
                                !row.reason_codes_json;
        
        if (isUninitialized) {
            // Contract exists but is uninitialized - initialize it
            return this.initializeContract(workspaceRoot || this.dbManager.getWorkspaceRoot());
        }

        const contract: SourceAccessContract = {
            status: row.status,
            resolver_type: row.resolver_type,
            workspace_root: row.workspace_root,
            constraints: row.max_bytes_per_request ? {
                max_bytes_per_request: row.max_bytes_per_request,
                max_lines_per_request: row.max_lines_per_request,
                max_concurrent_requests: row.max_concurrent_requests,
                redactions: JSON.parse(row.redactions_json || '[]')
            } : null,
            reason_codes: row.reason_codes_json ? JSON.parse(row.reason_codes_json).map((code: string) => {
                return ReasonCode[code as keyof typeof ReasonCode] || ReasonCode.NOT_MOUNTED;
            }) : [],
            verified_at: row.verified_at,
            evidence_grade: row.evidence_grade,
            evidence: createFactEvidence([
                createEvidenceSource('DB_QUERY', undefined, undefined, undefined, { table: 'source_access_config' })
            ], 'Source access contract retrieved from database')
        };

        // CRITICAL: Auto-correct workspace_root if it doesn't match MultiDbManager's workspace root
        // This handles cases where:
        // - Workspace was moved/renamed
        // - Contract was initialized with wrong workspace_root (e.g. process.cwd() on different system)
        // - Contract was restored from backup with different workspace_root
        // - Different path representations (e.g. D:\ vs d:\ on Windows)
        const dbWorkspaceRoot = this.dbManager.getWorkspaceRoot();
        const contractWorkspaceRoot = contract.workspace_root;
        if (contractWorkspaceRoot) {
            // Normalize both paths for comparison (path.resolve handles case normalization on Windows)
            const normalizedDbRoot = path.resolve(dbWorkspaceRoot);
            const normalizedContractRoot = path.resolve(contractWorkspaceRoot);
            if (normalizedContractRoot !== normalizedDbRoot) {
                // Workspace root mismatch detected - re-initialize with correct workspace root
                return this.initializeContract(workspaceRoot || dbWorkspaceRoot);
            }
        }

        // Verify current status (check if workspace still accessible)
        if (contract.status === 'AVAILABLE' && contract.workspace_root) {
            if (!fs.existsSync(contract.workspace_root)) {
                // Workspace no longer accessible
                return this.updateContract('UNAVAILABLE', [ReasonCode.NOT_MOUNTED], workspaceRoot);
            }
        }

        // If contract has UNAVAILABLE status with NOT_MOUNTED and a workspace_root that doesn't exist,
        // and a different workspaceRoot is provided, re-initialize with the new workspaceRoot
        if (contract.status === 'UNAVAILABLE' && 
            contract.workspace_root && 
            contract.reason_codes?.includes(ReasonCode.NOT_MOUNTED) &&
            !fs.existsSync(contract.workspace_root) &&
            workspaceRoot && 
            workspaceRoot !== contract.workspace_root &&
            fs.existsSync(workspaceRoot)) {
            // Old workspace_root doesn't exist, but new workspaceRoot is provided and exists - re-initialize
            return this.initializeContract(workspaceRoot);
        }

        return contract;
    }

    /**
     * Initialize source access contract.
     */
    async initializeContract(workspaceRoot: string): Promise<SourceAccessContract> {
        // Check if workspace is accessible
        const isAccessible = fs.existsSync(workspaceRoot);

        if (!isAccessible) {
            return this.updateContract('UNAVAILABLE', [ReasonCode.NOT_MOUNTED], workspaceRoot);
        }

        // Check read permissions
        try {
            fs.accessSync(workspaceRoot, fs.constants.R_OK);
        } catch (error) {
            return this.updateContract('UNAVAILABLE', [ReasonCode.PERMISSION_DENIED], workspaceRoot);
        }

        // All good - set as AVAILABLE
        return this.updateContract('AVAILABLE', [], workspaceRoot, {
            resolver_type: 'FILESYSTEM',
            constraints: {
                max_bytes_per_request: 51200,  // 50KB
                max_lines_per_request: 500,
                max_concurrent_requests: 5,
                redactions: ['*.env', '.git/*', 'node_modules/*', '*.key', '*.pem']
            }
        });
    }

    /**
     * Update source access contract.
     */
    private async updateContract(
        status: 'AVAILABLE' | 'UNAVAILABLE' | 'PARTIAL',
        reasonCodes: ReasonCode[],
        workspaceRoot?: string,
        options?: {
            resolver_type?: 'FILESYSTEM' | 'GIT' | 'REMOTE' | 'SNAPSHOT';
            constraints?: SourceAccessContract['constraints'];
        }
    ): Promise<SourceAccessContract> {
        const db = await this.dbManager.getDatabase('V');
        const now = new Date().toISOString();
        
        const workspaceRootToUse = workspaceRoot || (status === 'AVAILABLE' ? this.dbManager.getWorkspaceRoot() : null);

        await this.execute(db, `
            INSERT OR REPLACE INTO source_access_config (
                id, status, resolver_type, workspace_root,
                max_bytes_per_request, max_lines_per_request, max_concurrent_requests,
                redactions_json, reason_codes_json,
                verified_at, evidence_grade, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            'singleton',
            status,
            options?.resolver_type || null,
            workspaceRootToUse,
            options?.constraints?.max_bytes_per_request || null,
            options?.constraints?.max_lines_per_request || null,
            options?.constraints?.max_concurrent_requests || null,
            JSON.stringify(options?.constraints?.redactions || []),
            JSON.stringify(reasonCodes.map(code => code.toString())),
            now,
            'DETERMINISTIC',
            now
        ]);

        // Return contract directly without calling getContract (to avoid recursion)
        return {
            status,
            resolver_type: options?.resolver_type || null,
            workspace_root: workspaceRootToUse,
            constraints: options?.constraints || null,
            reason_codes: reasonCodes,
            verified_at: now,
            evidence_grade: 'DETERMINISTIC',
            evidence: createFactEvidence([
                createEvidenceSource('DB_QUERY', undefined, undefined, undefined, { table: 'source_access_config' })
            ], 'Source access contract updated')
        };
    }

    /**
     * Helper method to execute a query and return a single row.
     */
    private async queryOne(db: sqlite3.Database, sql: string, params: any[] = []): Promise<any> {
        return new Promise((resolve, reject) => {
            db.get(sql, params, (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    /**
     * Helper method to execute a query.
     */
    private async execute(db: sqlite3.Database, sql: string, params: any[] = []): Promise<void> {
        return new Promise((resolve, reject) => {
            db.run(sql, params, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }
}

