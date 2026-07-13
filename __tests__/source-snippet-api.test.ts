import { SourceSnippetApi } from '../src/api/source-snippet-api';
import { SourceAccessContractApi } from '../src/api/source-access-contract-api';
import { MultiDbManager } from '../src/core/multi-db-manager';
import { SymbolRepository } from '../src/repositories/symbol-repository';
import * as fs from 'fs';
import * as path from 'path';

// Mock modules
jest.mock('fs');
jest.mock('../src/api/source-access-contract-api');

describe('SourceSnippetApi', () => {
    let api: SourceSnippetApi;
    let mockDbManager: jest.Mocked<MultiDbManager>;
    let mockContractApi: jest.Mocked<SourceAccessContractApi>;
    let mockDb: any;
    let mockSymbolRepo: jest.Mocked<SymbolRepository>;

    beforeEach(() => {
        // Mock database
        mockDb = {
            get: jest.fn(),
            run: jest.fn()
        };

        // Mock MultiDbManager
        mockDbManager = {
            getDatabase: jest.fn().mockResolvedValue(mockDb)
        } as any;

        // Mock SourceAccessContractApi
        mockContractApi = {
            getContract: jest.fn()
        } as any;

        // Mock SymbolRepository
        mockSymbolRepo = {
            getBySymbolId: jest.fn()
        } as any;

        // Create API instance
        api = new SourceSnippetApi(mockDbManager);

        // Replace contractApi with mock
        (api as any).contractApi = mockContractApi;

        // Reset mocks
        jest.clearAllMocks();
    });

    describe('fetchSnippet', () => {
        test('should return SOURCE_UNAVAILABLE when contract status is UNAVAILABLE', async () => {
            // Mock: Contract UNAVAILABLE
            (mockContractApi.getContract as jest.Mock).mockResolvedValue({
                status: 'UNAVAILABLE',
                reason_codes: ['NOT_MOUNTED'],
                evidence: {
                    grade: 'FACT',
                    sources: []
                }
            });

            const result = await api.fetchSnippet({
                symbol_id: 'ts://test.ts#testFunction()',
                pluginId: 'test-plugin',
                workspaceRoot: '/test/workspace'
            });

            expect('error' in result).toBe(true);
            if ('error' in result) {
                expect(result.error).toBe('SOURCE_UNAVAILABLE');
                expect(result.reason_codes).toContain('NOT_MOUNTED');
            }
        });

        test('should return SYMBOL_NOT_FOUND when symbol does not exist', async () => {
            // Mock: Contract AVAILABLE
            (mockContractApi.getContract as jest.Mock).mockResolvedValue({
                status: 'AVAILABLE',
                workspace_root: '/test/workspace',
                constraints: {
                    max_bytes_per_request: 51200,
                    max_lines_per_request: 500,
                    max_concurrent_requests: 5,
                    redactions: []
                },
                evidence: {
                    grade: 'FACT',
                    sources: []
                }
            });

            // Mock: Symbol not found
            const symbolRepo = new SymbolRepository(mockDb);
            (SymbolRepository as jest.Mock).mockImplementation(() => symbolRepo);
            (symbolRepo.getBySymbolId as jest.Mock).mockResolvedValue(null);

            const result = await api.fetchSnippet({
                symbol_id: 'ts://test.ts#nonexistent()',
                pluginId: 'test-plugin',
                workspaceRoot: '/test/workspace'
            });

            expect('error' in result).toBe(true);
            if ('error' in result) {
                expect(result.error).toBe('SYMBOL_NOT_FOUND');
            }
        });

        test('should return SNIPPET_TOO_LARGE when requested lines exceed limit', async () => {
            // Mock: Contract AVAILABLE with limits
            (mockContractApi.getContract as jest.Mock).mockResolvedValue({
                status: 'AVAILABLE',
                workspace_root: '/test/workspace',
                constraints: {
                    max_bytes_per_request: 51200,
                    max_lines_per_request: 500,
                    max_concurrent_requests: 5,
                    redactions: []
                },
                evidence: {
                    grade: 'FACT',
                    sources: []
                }
            });

            // Mock: Symbol found with large span
            const symbolRepo = new SymbolRepository(mockDb);
            (SymbolRepository as jest.Mock).mockImplementation(() => symbolRepo);
            (symbolRepo.getBySymbolId as jest.Mock).mockResolvedValue({
                id: 'symbol-1',
                plugin_id: 'test-plugin',
                symbol_id: 'ts://test.ts#testFunction()',
                path: 'test.ts',
                kind: 'function',
                name: 'testFunction',
                signature_json: '{}',
                signature_hash: 'hash1',
                summary: null,
                start_line: 1,
                end_line: 1000, // Exceeds limit
                start_col: 0,
                end_col: 0,
                byte_offset_start: 0,
                byte_offset_end: 0,
                deleted_at: null,
                created_at: new Date(),
                updated_at: new Date()
            });

            const result = await api.fetchSnippet({
                symbol_id: 'ts://test.ts#testFunction()',
                pluginId: 'test-plugin',
                workspaceRoot: '/test/workspace',
                include_context: true,
                context_lines: 10
            });

            expect('error' in result).toBe(true);
            if ('error' in result) {
                expect(result.error).toBe('SNIPPET_TOO_LARGE');
            }
        });

        test('should return FILE_NOT_FOUND when file does not exist', async () => {
            // Mock: Contract AVAILABLE
            (mockContractApi.getContract as jest.Mock).mockResolvedValue({
                status: 'AVAILABLE',
                workspace_root: '/test/workspace',
                constraints: {
                    max_bytes_per_request: 51200,
                    max_lines_per_request: 500,
                    max_concurrent_requests: 5,
                    redactions: []
                },
                evidence: {
                    grade: 'FACT',
                    sources: []
                }
            });

            // Mock: Symbol found
            const symbolRepo = new SymbolRepository(mockDb);
            (SymbolRepository as jest.Mock).mockImplementation(() => symbolRepo);
            (symbolRepo.getBySymbolId as jest.Mock).mockResolvedValue({
                id: 'symbol-1',
                plugin_id: 'test-plugin',
                symbol_id: 'ts://test.ts#testFunction()',
                path: 'test.ts',
                kind: 'function',
                name: 'testFunction',
                signature_json: '{}',
                signature_hash: 'hash1',
                summary: null,
                start_line: 10,
                end_line: 20,
                start_col: 0,
                end_col: 0,
                byte_offset_start: 0,
                byte_offset_end: 0,
                deleted_at: null,
                created_at: new Date(),
                updated_at: new Date()
            });

            // Mock: File not found
            (fs.existsSync as jest.Mock).mockReturnValue(false);

            const result = await api.fetchSnippet({
                symbol_id: 'ts://test.ts#testFunction()',
                pluginId: 'test-plugin',
                workspaceRoot: '/test/workspace'
            });

            expect('error' in result).toBe(true);
            if ('error' in result) {
                expect(result.error).toBe('FILE_NOT_FOUND');
            }
        });

        test('should return snippet when file exists and within limits', async () => {
            // Mock: Contract AVAILABLE
            (mockContractApi.getContract as jest.Mock).mockResolvedValue({
                status: 'AVAILABLE',
                workspace_root: '/test/workspace',
                constraints: {
                    max_bytes_per_request: 51200,
                    max_lines_per_request: 500,
                    max_concurrent_requests: 5,
                    redactions: []
                },
                evidence: {
                    grade: 'FACT',
                    sources: []
                }
            });

            // Mock: Symbol found
            const symbolRepo = new SymbolRepository(mockDb);
            (SymbolRepository as jest.Mock).mockImplementation(() => symbolRepo);
            (symbolRepo.getBySymbolId as jest.Mock).mockResolvedValue({
                id: 'symbol-1',
                plugin_id: 'test-plugin',
                symbol_id: 'ts://test.ts#testFunction()',
                path: 'test.ts',
                kind: 'function',
                name: 'testFunction',
                signature_json: '{}',
                signature_hash: 'hash1',
                summary: null,
                start_line: 10,
                end_line: 20,
                start_col: 0,
                end_col: 0,
                byte_offset_start: 0,
                byte_offset_end: 0,
                deleted_at: null,
                created_at: new Date(),
                updated_at: new Date()
            });

            // Mock: File exists
            (fs.existsSync as jest.Mock).mockReturnValue(true);
            (fs.readFileSync as jest.Mock).mockReturnValue(
                'line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10\n' +
                'line11\nline12\nline13\nline14\nline15\nline16\nline17\nline18\nline19\nline20\n'
            );

            const result = await api.fetchSnippet({
                symbol_id: 'ts://test.ts#testFunction()',
                pluginId: 'test-plugin',
                workspaceRoot: '/test/workspace'
            });

            expect('error' in result).toBe(false);
            if (!('error' in result)) {
                expect(result.file_path).toBe('test.ts');
                expect(result.start_line).toBe(10);
                expect(result.end_line).toBe(20);
                expect(result.snippet).toBeDefined();
                expect(result.content_hash).toBeDefined();
                expect(result.evidence.grade).toBe('FACT');
            }
        });

        test('should return HASH_MISMATCH when hash verification fails', async () => {
            // Mock: Contract AVAILABLE
            (mockContractApi.getContract as jest.Mock).mockResolvedValue({
                status: 'AVAILABLE',
                workspace_root: '/test/workspace',
                constraints: {
                    max_bytes_per_request: 51200,
                    max_lines_per_request: 500,
                    max_concurrent_requests: 5,
                    redactions: []
                },
                evidence: {
                    grade: 'FACT',
                    sources: []
                }
            });

            // Mock: Symbol found
            const symbolRepo = new SymbolRepository(mockDb);
            (SymbolRepository as jest.Mock).mockImplementation(() => symbolRepo);
            (symbolRepo.getBySymbolId as jest.Mock).mockResolvedValue({
                id: 'symbol-1',
                plugin_id: 'test-plugin',
                symbol_id: 'ts://test.ts#testFunction()',
                path: 'test.ts',
                kind: 'function',
                name: 'testFunction',
                signature_json: '{}',
                signature_hash: 'hash1',
                summary: null,
                start_line: 10,
                end_line: 20,
                start_col: 0,
                end_col: 0,
                byte_offset_start: 0,
                byte_offset_end: 0,
                deleted_at: null,
                created_at: new Date(),
                updated_at: new Date()
            });

            // Mock: File exists
            (fs.existsSync as jest.Mock).mockReturnValue(true);
            (fs.readFileSync as jest.Mock).mockReturnValue(
                'line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10\n' +
                'line11\nline12\nline13\nline14\nline15\nline16\nline17\nline18\nline19\nline20\n'
            );

            const result = await api.fetchSnippet({
                symbol_id: 'ts://test.ts#testFunction()',
                pluginId: 'test-plugin',
                workspaceRoot: '/test/workspace',
                content_hash: 'wrong-hash',
                verify_hash: true
            });

            expect('error' in result).toBe(true);
            if ('error' in result) {
                expect(result.error).toBe('HASH_MISMATCH');
            }
        });
    });
});

