import * as sqlite3 from 'sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { MultiDbManager } from '../core/multi-db-manager';
import { SourceAccessContractApi, SourceAccessContract } from './source-access-contract-api';
import { SymbolRepository } from '../repositories/symbol-repository';
import { ReasonCode } from '../models/reason-codes';
import { Evidence, createFactEvidence } from '../models/evidence';
import { createEvidenceSource } from '../models/evidence';

/**
 * Source code snippet with metadata.
 */
export interface SourceSnippet {
    file_path: string;
    start_line: number;
    end_line: number;
    core_start_line: number;  // Without context
    core_end_line: number;    // Without context
    snippet: string;
    content_hash: string;
    byte_size: number;
    evidence: Evidence;
}

/**
 * Source snippet error.
 */
export interface SourceSnippetError {
    error: 'SOURCE_UNAVAILABLE' | 'SYMBOL_NOT_FOUND' | 'SNIPPET_TOO_LARGE' | 'FILE_NOT_FOUND' | 'HASH_MISMATCH';
    reason_codes?: ReasonCode[];
    symbol_id?: string;
    requested_lines?: number;
    max_allowed?: number;
    file_path?: string;
    resolved_path?: string;
    expected_hash?: string;
    computed_hash?: string;
    evidence: Evidence;
}

/**
 * API for fetching source code snippets.
 * Provides gated access with size limits and hash verification.
 */
export class SourceSnippetApi {
    private contractApi: SourceAccessContractApi;
    private dbManager: MultiDbManager;

    constructor(dbManager: MultiDbManager) {
        this.dbManager = dbManager;
        this.contractApi = new SourceAccessContractApi(dbManager);
    }

    /**
     * Fetch source code snippet by symbol ID or file path + range.
     * Gated access with size limits and hash verification.
     */
    async fetchSnippet(args: {
        symbol_id?: string;
        file_path?: string;
        start_line?: number;
        end_line?: number;
        content_hash?: string;
        include_context?: boolean;
        context_lines?: number;
        verify_hash?: boolean;
        pluginId: string;
        workspaceRoot?: string;
    }): Promise<SourceSnippet | SourceSnippetError> {
        
        // 1. Get source access contract
        const contract = await this.contractApi.getContract(args.workspaceRoot);

        if (contract.status === 'UNAVAILABLE') {
            return {
                error: 'SOURCE_UNAVAILABLE',
                reason_codes: contract.reason_codes,
                evidence: createFactEvidence([
                    createEvidenceSource('DB_QUERY', undefined, undefined, undefined, { 
                        table: 'source_access_config',
                        status: contract.status 
                    })
                ], `Source code unavailable: ${contract.reason_codes?.map(code => code.toString()).join(', ')}`)
            };
        }

        // 2. Resolve symbol to span (if symbol_id provided)
        let filePath = args.file_path;
        let startLine = args.start_line;
        let endLine = args.end_line;

        if (args.symbol_id) {
            const db = await this.dbManager.getDatabase('Y');
            const repository = new SymbolRepository(db);
            
            // Try to find symbol by symbol_id
            const symbol = await repository.getBySymbolId(args.symbol_id, args.pluginId);

            if (!symbol) {
                return {
                    error: 'SYMBOL_NOT_FOUND',
                    symbol_id: args.symbol_id,
                    evidence: createFactEvidence([
                        createEvidenceSource('DB_QUERY', args.symbol_id, undefined, undefined, { 
                            table: 'symbols',
                            plugin_id: args.pluginId 
                        })
                    ], `Symbol ${args.symbol_id} not found in database`)
                };
            }

            if (!symbol.start_line || !symbol.end_line) {
                return {
                    error: 'SYMBOL_NOT_FOUND',
                    symbol_id: args.symbol_id,
                    evidence: createFactEvidence([
                        createEvidenceSource('DB_QUERY', args.symbol_id, symbol.path, undefined, { 
                            table: 'symbols',
                            note: 'Symbol found but missing span information'
                        })
                    ], `Symbol ${args.symbol_id} found but missing span information (start_line/end_line)`)
                };
            }

            filePath = symbol.path;
            startLine = symbol.start_line;
            endLine = symbol.end_line;
        }

        if (!filePath || !startLine || !endLine) {
            throw new Error('Either symbol_id OR (file_path + start_line + end_line) must be provided');
        }

        // 3. Size check (gating!)
        const requestedLines = endLine - startLine + 1;
        const contextLines = args.include_context ? (args.context_lines || 5) : 0;
        const totalLines = requestedLines + (contextLines * 2);

        if (contract.constraints && totalLines > contract.constraints.max_lines_per_request) {
            return {
                error: 'SNIPPET_TOO_LARGE',
                requested_lines: totalLines,
                max_allowed: contract.constraints.max_lines_per_request,
                evidence: createFactEvidence([
                    createEvidenceSource('DB_QUERY', undefined, undefined, undefined, { 
                        table: 'source_access_config',
                        constraint: 'max_lines_per_request'
                    })
                ], `Requested ${totalLines} lines exceeds limit of ${contract.constraints.max_lines_per_request}`)
            };
        }

        // 4. Fetch code from filesystem
        // Use MultiDbManager's workspace root as primary source (most reliable)
        const dbWorkspaceRoot = this.dbManager.getWorkspaceRoot();
        const workspaceRoot = contract.workspace_root || args.workspaceRoot || dbWorkspaceRoot;
        const fullPath = path.join(workspaceRoot, filePath);

        if (!fs.existsSync(fullPath)) {
            return {
                error: 'FILE_NOT_FOUND',
                file_path: filePath,
                resolved_path: fullPath,
                evidence: createFactEvidence([
                    createEvidenceSource('STATUS_CHECK', undefined, fullPath, undefined, { 
                        check: 'file_exists'
                    })
                ], `File not found: ${fullPath}`)
            };
        }

        const fileContent = fs.readFileSync(fullPath, 'utf-8');
        const lines = fileContent.split('\n');

        // 5. Extract snippet with optional context
        const actualStart = Math.max(1, startLine - contextLines);
        const actualEnd = Math.min(lines.length, endLine + contextLines);

        const snippet = lines.slice(actualStart - 1, actualEnd).join('\n');

        // 6. Hash verification (if requested)
        const computedHash = crypto.createHash('sha256').update(snippet).digest('hex').substring(0, 16);

        if (args.verify_hash && args.content_hash && computedHash !== args.content_hash) {
            return {
                error: 'HASH_MISMATCH',
                expected_hash: args.content_hash,
                computed_hash: computedHash,
                evidence: createFactEvidence([
                    createEvidenceSource('STATUS_CHECK', undefined, fullPath, computedHash, { 
                        check: 'hash_verification',
                        expected: args.content_hash
                    })
                ], `Hash mismatch: expected ${args.content_hash}, got ${computedHash}. Code may have changed since scan.`)
            };
        }

        // 7. Return snippet with provenance
        return {
            file_path: filePath,
            start_line: actualStart,
            end_line: actualEnd,
            core_start_line: startLine,
            core_end_line: endLine,
            snippet: snippet,
            content_hash: computedHash,
            byte_size: Buffer.byteLength(snippet, 'utf-8'),
            evidence: createFactEvidence([
                createEvidenceSource('STATUS_CHECK', undefined, fullPath, computedHash, { 
                    check: 'filesystem_read',
                    lines: `${actualStart}-${actualEnd}`
                })
            ], `Code snippet extracted from ${filePath} lines ${startLine}-${endLine} with ${contextLines} context lines`)
        };
    }
}

