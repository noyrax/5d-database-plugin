import { MultiDbManager } from '../src/core/multi-db-manager';
import { MigrationManager } from '../src/core/migration-manager';
import { SymbolIngestor } from '../src/ingestors/symbol-ingestor';
import { SymbolRepository } from '../src/repositories/symbol-repository';
import { PathNormalizer } from '../src/core/path-normalizer';
import { SourceSnippetApi } from '../src/api/source-snippet-api';
import { SourceAccessContractApi } from '../src/api/source-access-contract-api';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// Debug logging helper
const debugLog = (location: string, message: string, data: any, hypothesisId: string) => {
    try {
        const logPath = path.resolve(__dirname, '..', '..', '..', '.cursor', 'debug.log');
        const logEntry = JSON.stringify({ location, message, data, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId }) + '\n';
        fs.appendFileSync(logPath, logEntry, 'utf8');
    } catch (e) {
        // Ignore logging errors
    }
};

/**
 * Integration tests for Self-Understanding System Stabilization.
 * Tests cover:
 * - Legacy symbol cleanup (unknown:// → ts://)
 * - Span invariants (ts:// symbols must have spans)
 * - Path normalization consistency
 * - Source snippet API workspace root resolution
 */
describe('Stabilization Tests', () => {
    let dbManager: MultiDbManager;
    let migrationManager: MigrationManager;
    let testWorkspaceRoot: string;
    let pluginId: string;

    beforeAll(async () => {
        // Create temporary test workspace
        testWorkspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'noyrax-test-'));
        dbManager = new MultiDbManager(testWorkspaceRoot);
        pluginId = dbManager.getPluginId();
        
        // Ensure database directory exists
        const dbDir = path.join(testWorkspaceRoot, '.database-plugin');
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }

        // Run migrations to create tables
        const pluginRoot = path.resolve(__dirname, '..');
        migrationManager = new MigrationManager(dbManager, pluginRoot);
        // #region agent log
        debugLog('stabilization.test.ts:41', 'beforeAll: migrateAll called', { testWorkspaceRoot }, 'A');
        // #endregion
        await migrationManager.migrateAll();
    });

    afterAll(async () => {
        // Cleanup: Close all database connections
        await dbManager.closeAll();
        
        // Remove test workspace
        if (fs.existsSync(testWorkspaceRoot)) {
            fs.rmSync(testWorkspaceRoot, { recursive: true, force: true });
        }
    });

    describe('Legacy Symbol Cleanup', () => {
        it('should delete unknown:// duplicate when ts:// symbol is ingested', async () => {
            const symbolIngestor = new SymbolIngestor(dbManager);
            const db = await dbManager.getDatabase('Y');
            const repository = new SymbolRepository(db);

            // Create a legacy unknown:// symbol
            const legacySymbolId = 'unknown://test-file.ts#TestClass';
            const tsSymbolId = 'ts://test-file.ts#TestClass';
            
            const legacySymbol = {
                id: 'legacy-uuid',
                plugin_id: pluginId,
                symbol_id: legacySymbolId,
                path: 'test-file.ts',
                kind: 'class',
                name: 'TestClass',
                signature_json: '{}',
                signature_hash: 'test-hash-123',
                summary: null,
                start_line: 1,
                end_line: 10,
                start_col: null,
                end_col: null,
                byte_offset_start: null,
                byte_offset_end: null,
                deleted_at: null,
                created_at: new Date(),
                updated_at: new Date()
            };

            await repository.create(legacySymbol);

            // Verify legacy symbol exists
            const before = await repository.getBySymbolId(legacySymbolId, pluginId);
            expect(before).not.toBeNull();
            expect(before?.symbol_id).toBe(legacySymbolId);

            // Ingest ts:// symbol (should trigger cleanup)
            const symbolData = {
                symbol_id: tsSymbolId,
                path: 'test-file.ts',
                kind: 'class',
                name: 'TestClass',
                signature: {},
                signature_hash: 'test-hash-123',
                startLine: 1,
                endLine: 10
            };

            await symbolIngestor['ingestSymbol'](symbolData, pluginId, repository);

            // Verify legacy symbol is deleted (soft delete)
            const after = await repository.getBySymbolId(legacySymbolId, pluginId);
            expect(after).toBeNull(); // Should be null because deleted_at is set

            // Verify ts:// symbol exists
            const tsSymbol = await repository.getBySymbolId(tsSymbolId, pluginId);
            expect(tsSymbol).not.toBeNull();
            expect(tsSymbol?.symbol_id).toBe(tsSymbolId);
        });

        it('should NOT delete unknown:// if it is NOT a duplicate (different signature hash)', async () => {
            const symbolIngestor = new SymbolIngestor(dbManager);
            const db = await dbManager.getDatabase('Y');
            const repository = new SymbolRepository(db);

            // Create a legacy unknown:// symbol with different signature
            const legacySymbolId = 'unknown://test-file2.ts#TestClass';
            const tsSymbolId = 'ts://test-file2.ts#TestClass';
            
            const legacySymbol = {
                id: 'legacy-uuid-2',
                plugin_id: pluginId,
                symbol_id: legacySymbolId,
                path: 'test-file2.ts',
                kind: 'class',
                name: 'TestClass',
                signature_json: '{}',
                signature_hash: 'different-hash-456', // Different hash!
                summary: null,
                start_line: 1,
                end_line: 10,
                start_col: null,
                end_col: null,
                byte_offset_start: null,
                byte_offset_end: null,
                deleted_at: null,
                created_at: new Date(),
                updated_at: new Date()
            };

            await repository.create(legacySymbol);

            // Ingest ts:// symbol with different signature hash
            const symbolData = {
                symbol_id: tsSymbolId,
                path: 'test-file2.ts',
                kind: 'class',
                name: 'TestClass',
                signature: {},
                signature_hash: 'test-hash-789', // Different hash
                startLine: 1,
                endLine: 10
            };

            await symbolIngestor['ingestSymbol'](symbolData, pluginId, repository);

            // Verify legacy symbol is NOT deleted (different signature)
            const after = await repository.getBySymbolId(legacySymbolId, pluginId);
            expect(after).not.toBeNull(); // Should still exist
        });
    });

    describe('Span Invariants', () => {
        it('should verify that ts:// symbols have spans after ingestion', async () => {
            const symbolIngestor = new SymbolIngestor(dbManager);
            const db = await dbManager.getDatabase('Y');
            const repository = new SymbolRepository(db);

            // Ingest ts:// symbol WITH spans
            const symbolData = {
                symbol_id: 'ts://test-span.ts#TestFunction',
                path: 'test-span.ts',
                kind: 'function',
                name: 'TestFunction',
                signature: {},
                startLine: 5,
                endLine: 15,
                startCol: 0,
                endCol: 50,
                byteOffsetStart: 100,
                byteOffsetEnd: 500
            };

            await symbolIngestor['ingestSymbol'](symbolData, pluginId, repository);

            // Verify symbol has spans
            const symbol = await repository.getBySymbolId('ts://test-span.ts#TestFunction', pluginId);
            expect(symbol).not.toBeNull();
            expect(symbol?.start_line).toBe(5);
            expect(symbol?.end_line).toBe(15);
            expect(symbol?.start_col).toBe(0);
            expect(symbol?.end_col).toBe(50);
            expect(symbol?.byte_offset_start).toBe(100);
            expect(symbol?.byte_offset_end).toBe(500);
        });

        it('should handle ts:// symbols without spans (legacy data)', async () => {
            const db = await dbManager.getDatabase('Y');
            const repository = new SymbolRepository(db);

            // Create ts:// symbol WITHOUT spans (legacy scenario)
            const symbolWithoutSpans = {
                id: 'no-spans-uuid',
                plugin_id: pluginId,
                symbol_id: 'ts://test-no-spans.ts#TestClass',
                path: 'test-no-spans.ts',
                kind: 'class',
                name: 'TestClass',
                signature_json: '{}',
                signature_hash: 'hash-123',
                summary: null,
                start_line: null, // Missing spans
                end_line: null,
                start_col: null,
                end_col: null,
                byte_offset_start: null,
                byte_offset_end: null,
                deleted_at: null,
                created_at: new Date(),
                updated_at: new Date()
            };

            await repository.create(symbolWithoutSpans);

            // Verify symbol exists but has no spans
            const symbol = await repository.getBySymbolId('ts://test-no-spans.ts#TestClass', pluginId);
            expect(symbol).not.toBeNull();
            expect(symbol?.start_line).toBeNull();
            expect(symbol?.end_line).toBeNull();
        });
    });

    describe('Path Normalization', () => {
        it('should normalize paths consistently', () => {
            const testCases = [
                { input: 'src/file.ts', expected: path.resolve('src/file.ts').replace(/\\/g, '/') },
                { input: 'src\\file.ts', expected: path.resolve('src/file.ts').replace(/\\/g, '/') },
                { input: 'src//file.ts', expected: path.resolve('src/file.ts').replace(/\\/g, '/') },
                { input: 'src/file.ts/', expected: path.resolve('src/file.ts').replace(/\\/g, '/') },
                { input: './src/file.ts', expected: path.resolve('./src/file.ts').replace(/\\/g, '/') }
            ];

            for (const testCase of testCases) {
                const normalized = PathNormalizer.normalizePath(testCase.input);
                expect(normalized).toBe(testCase.expected);
            }
        });

        it('should compare paths correctly (case-insensitive on Windows)', () => {
            const p1 = 'src/File.ts';
            const p2 = 'src/file.ts';

            if (process.platform === 'win32') {
                expect(PathNormalizer.pathsEqual(p1, p2)).toBe(true);
            } else {
                expect(PathNormalizer.pathsEqual(p1, p2)).toBe(false);
            }
        });

        it('should generate lookup variants for path queries', () => {
            const variants = PathNormalizer.generateLookupVariants('src/file.ts');
            expect(variants.length).toBeGreaterThan(0);
            expect(variants).toContain('src/file.ts');
        });
    });

    describe('Source Snippet API Workspace Root Resolution', () => {
        it('should use MultiDbManager workspace root instead of process.cwd()', async () => {
            // Migrations were already run in beforeAll, no need to run again
            
            const api = new SourceSnippetApi(dbManager);
            const contractApi = new SourceAccessContractApi(dbManager);

            // Initialize contract with test workspace root
            await contractApi.initializeContract(testWorkspaceRoot);

            // Create a test file in the workspace
            const testFilePath = path.join(testWorkspaceRoot, 'test-snippet.ts');
            const testContent = 'line 1\nline 2\nline 3\nline 4\nline 5';
            fs.writeFileSync(testFilePath, testContent);

            try {
                // Fetch snippet using relative path
                const result = await api.fetchSnippet({
                    file_path: 'test-snippet.ts',
                    start_line: 2,
                    end_line: 4,
                    pluginId: pluginId,
                    workspaceRoot: testWorkspaceRoot
                });

                // Should succeed (not FILE_NOT_FOUND)
                expect('error' in result).toBe(false);
                if ('snippet' in result) {
                    expect(result.snippet).toContain('line 2');
                    expect(result.snippet).toContain('line 4');
                }
            } finally {
                // Cleanup
                if (fs.existsSync(testFilePath)) {
                    fs.unlinkSync(testFilePath);
                }
            }
        });
    });

    describe('Plugin ID Consistency', () => {
        it('should use consistent plugin ID calculation', () => {
            const pluginId1 = dbManager.getPluginId();
            const pluginId2 = dbManager.getPluginId();
            
            expect(pluginId1).toBe(pluginId2);
            expect(pluginId1).toMatch(/^[0-9a-f]{16}$/);
        });
    });
});

