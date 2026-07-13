import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { MultiDbManager } from '../../src/core/multi-db-manager';
import { MigrationManager } from '../../src/core/migration-manager';
import { SourceAccessContractApi } from '../../src/api/source-access-contract-api';
import { SourceSnippetApi } from '../../src/api/source-snippet-api';
import { SymbolRepository } from '../../src/repositories/symbol-repository';
import { EvidenceGrader } from '../../src/api/evidence-grader';

describe('Source Code Evidence Layer Integration', () => {
    let tempDir: string;
    let dbManager: MultiDbManager;
    let migrationManager: MigrationManager;
    let contractApi: SourceAccessContractApi;
    let snippetApi: SourceSnippetApi;
    let testWorkspace: string;
    let testFile: string;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), '5d-db-test-'));
        dbManager = new MultiDbManager(tempDir);
        const pluginRoot = path.resolve(__dirname, '..', '..');
        migrationManager = new MigrationManager(dbManager, pluginRoot);
        
        contractApi = new SourceAccessContractApi(dbManager);
        snippetApi = new SourceSnippetApi(dbManager);

        // Create test workspace
        testWorkspace = path.join(tempDir, 'workspace');
        fs.mkdirSync(testWorkspace, { recursive: true });

        // Create test file
        testFile = path.join(testWorkspace, 'test.ts');
        fs.writeFileSync(testFile, 
            'export function testFunction(): string {\n' +
            '    return "test";\n' +
            '}\n' +
            '\n' +
            'export class TestClass {\n' +
            '    method(): void {\n' +
            '        // Test\n' +
            '    }\n' +
            '}\n'
        );
    });

    afterEach(async () => {
        await dbManager.closeAll();
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    test('should initialize source access contract as AVAILABLE when workspace is accessible', async () => {
        await migrationManager.migrateAll();

        const contract = await contractApi.initializeContract(testWorkspace);

        expect(contract.status).toBe('AVAILABLE');
        expect(contract.resolver_type).toBe('FILESYSTEM');
        expect(contract.workspace_root).toBe(testWorkspace);
        expect(contract.constraints).toBeDefined();
        expect(contract.constraints?.max_bytes_per_request).toBe(51200);
        expect(contract.evidence.grade).toBe('FACT');
    });

    test('should fetch source snippet by file path and range', async () => {
        await migrationManager.migrateAll();

        // Initialize contract
        await contractApi.initializeContract(testWorkspace);

        // Fetch snippet
        const result = await snippetApi.fetchSnippet({
            file_path: 'test.ts',
            start_line: 1,
            end_line: 3,
            pluginId: dbManager.getPluginId(),
            workspaceRoot: testWorkspace
        });

        expect('error' in result).toBe(false);
        if (!('error' in result)) {
            expect(result.file_path).toBe('test.ts');
            expect(result.start_line).toBe(1);
            expect(result.end_line).toBe(3);
            expect(result.snippet).toContain('export function testFunction');
            expect(result.content_hash).toBeDefined();
            expect(result.evidence.grade).toBe('FACT');
        }
    });

    test('should fetch source snippet by symbol ID with span data', async () => {
        await migrationManager.migrateAll();

        // Initialize contract
        await contractApi.initializeContract(testWorkspace);

        // Create symbol with span data
        const db = await dbManager.getDatabase('Y');
        const symbolRepo = new SymbolRepository(db);
        const pluginId = dbManager.getPluginId();

        const symbol = {
            id: 'symbol-1',
            plugin_id: pluginId,
            symbol_id: 'ts://test.ts#testFunction()',
            path: 'test.ts',
            kind: 'function',
            name: 'testFunction',
            signature_json: JSON.stringify({ name: 'testFunction', parameters: [], returnType: 'string' }),
            signature_hash: 'hash1',
            summary: null,
            start_line: 1,
            end_line: 3,
            start_col: 0,
            end_col: 0,
            byte_offset_start: 0,
            byte_offset_end: 50,
            deleted_at: null,
            created_at: new Date(),
            updated_at: new Date()
        };

        await symbolRepo.create(symbol);

        // Fetch snippet by symbol ID
        const result = await snippetApi.fetchSnippet({
            symbol_id: 'ts://test.ts#testFunction()',
            pluginId: pluginId,
            workspaceRoot: testWorkspace
        });

        expect('error' in result).toBe(false);
        if (!('error' in result)) {
            expect(result.file_path).toBe('test.ts');
            expect(result.core_start_line).toBe(1);
            expect(result.core_end_line).toBe(3);
            expect(result.snippet).toContain('export function testFunction');
            expect(result.evidence.grade).toBe('FACT');
        }
    });

    test('should enforce size limits when snippet exceeds max_lines_per_request', async () => {
        await migrationManager.migrateAll();

        // Initialize contract with small limit
        await contractApi.initializeContract(testWorkspace);

        // Create large file
        const largeFile = path.join(testWorkspace, 'large.ts');
        const largeContent = Array.from({ length: 1000 }, (_, i) => `// Line ${i + 1}\n`).join('');
        fs.writeFileSync(largeFile, largeContent);

        // Try to fetch large range
        const result = await snippetApi.fetchSnippet({
            file_path: 'large.ts',
            start_line: 1,
            end_line: 600, // Exceeds default limit of 500
            pluginId: dbManager.getPluginId(),
            workspaceRoot: testWorkspace
        });

        expect('error' in result).toBe(true);
        if ('error' in result) {
            expect(result.error).toBe('SNIPPET_TOO_LARGE');
        }
    });

    test('should verify hash when verify_hash is true', async () => {
        await migrationManager.migrateAll();

        // Initialize contract
        await contractApi.initializeContract(testWorkspace);

        // Fetch snippet first time to get hash
        const firstResult = await snippetApi.fetchSnippet({
            file_path: 'test.ts',
            start_line: 1,
            end_line: 3,
            pluginId: dbManager.getPluginId(),
            workspaceRoot: testWorkspace
        });

        expect('error' in firstResult).toBe(false);
        if (!('error' in firstResult)) {
            const hash = firstResult.content_hash;

            // Modify file
            fs.writeFileSync(testFile, 
                'export function testFunction(): string {\n' +
                '    return "modified";\n' + // Changed
                '}\n'
            );

            // Try to fetch with old hash
            const secondResult = await snippetApi.fetchSnippet({
                file_path: 'test.ts',
                start_line: 1,
                end_line: 3,
                pluginId: dbManager.getPluginId(),
                workspaceRoot: testWorkspace,
                content_hash: hash,
                verify_hash: true
            });

            expect('error' in secondResult).toBe(true);
            if ('error' in secondResult) {
                expect(secondResult.error).toBe('HASH_MISMATCH');
            }
        }
    });

    test('should use EvidenceGrader.gradeCodeAnalysis for code analysis evidence', () => {
        const grader = new EvidenceGrader();

        // Test: Code not retrieved
        const evidence1 = grader.gradeCodeAnalysis({
            source_snippet_retrieved: false,
            source_hash_verified: false,
            analysis: 'Analysis based on signatures only'
        });

        expect(evidence1.grade).toBe('INFERRED');
        expect(evidence1.description).toContain('WARNING');

        // Test: Code retrieved but not verified
        const evidence2 = grader.gradeCodeAnalysis({
            source_snippet_retrieved: true,
            source_hash_verified: false,
            analysis: 'Analysis based on unverified code'
        });

        expect(evidence2.grade).toBe('INFERRED');
        expect(evidence2.description).toContain('WARNING');

        // Test: Code retrieved and verified
        const evidence3 = grader.gradeCodeAnalysis({
            source_snippet_retrieved: true,
            source_hash_verified: true,
            analysis: 'Analysis based on verified code'
        });

        expect(evidence3.grade).toBe('FACT');
        expect(evidence3.description).toContain('✅');
    });
});

