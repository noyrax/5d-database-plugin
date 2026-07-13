import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as sqlite3 from 'sqlite3';
import { MultiDbManager } from '../../src/core/multi-db-manager';
import { MigrationManager } from '../../src/core/migration-manager';
import { SymbolRepository } from '../../src/repositories/symbol-repository';
import { ModuleRepository } from '../../src/repositories/module-repository';

describe('Source Code Evidence Migration', () => {
    let tempDir: string;
    let dbManager: MultiDbManager;
    let migrationManager: MigrationManager;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), '5d-db-migration-test-'));
        dbManager = new MultiDbManager(tempDir);
        const pluginRoot = path.resolve(__dirname, '..', '..');
        migrationManager = new MigrationManager(dbManager, pluginRoot);
    });

    afterEach(async () => {
        await dbManager.closeAll();
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    test('should apply migration 007_add_source_code_spans to symbols table', async () => {
        await migrationManager.migrateAll();

        const db = await dbManager.getDatabase('Y');
        
        // Check if span columns exist
        const columns = await new Promise<string[]>((resolve, reject) => {
            db.all(
                "PRAGMA table_info(symbols)",
                (err, rows: any[]) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(rows.map((row: any) => row.name));
                    }
                }
            );
        });

        expect(columns).toContain('start_line');
        expect(columns).toContain('end_line');
        expect(columns).toContain('start_col');
        expect(columns).toContain('end_col');
        expect(columns).toContain('byte_offset_start');
        expect(columns).toContain('byte_offset_end');

        // Check if index exists
        const indexes = await new Promise<string[]>((resolve, reject) => {
            db.all(
                "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='symbols'",
                (err, rows: any[]) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(rows.map((row: any) => row.name));
                    }
                }
            );
        });

        expect(indexes).toContain('idx_symbols_span');
    });

    test('should apply migration 007_add_source_code_spans to modules table', async () => {
        await migrationManager.migrateAll();

        const db = await dbManager.getDatabase('X');
        
        // Check if metadata columns exist
        const columns = await new Promise<string[]>((resolve, reject) => {
            db.all(
                "PRAGMA table_info(modules)",
                (err, rows: any[]) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(rows.map((row: any) => row.name));
                    }
                }
            );
        });

        expect(columns).toContain('line_count');
        expect(columns).toContain('byte_size');
    });

    test('should apply migration 008_add_source_access_config to V-Dimension', async () => {
        await migrationManager.migrateAll();

        const db = await dbManager.getDatabase('V');
        
        // Check if table exists
        const tableExists = await new Promise<boolean>((resolve, reject) => {
            db.get(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='source_access_config'",
                (err, row: any) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(!!row);
                    }
                }
            );
        });

        expect(tableExists).toBe(true);

        // Check if default row exists
        const defaultRow = await new Promise<any>((resolve, reject) => {
            db.get(
                "SELECT * FROM source_access_config WHERE id = 'singleton'",
                (err, row: any) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(row);
                    }
                }
            );
        });

        expect(defaultRow).toBeDefined();
        expect(defaultRow.status).toBe('UNAVAILABLE');
        expect(defaultRow.evidence_grade).toBe('DETERMINISTIC');
    });

    test('should allow creating symbols with span data', async () => {
        await migrationManager.migrateAll();

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
            signature_json: JSON.stringify({ name: 'testFunction', parameters: [] }),
            signature_hash: 'hash1',
            summary: null,
            start_line: 10,
            end_line: 20,
            start_col: 0,
            end_col: 0,
            byte_offset_start: 100,
            byte_offset_end: 200,
            deleted_at: null,
            created_at: new Date(),
            updated_at: new Date()
        };

        await symbolRepo.create(symbol);

        const retrieved = await symbolRepo.getById('symbol-1', pluginId);
        expect(retrieved).toBeDefined();
        expect(retrieved?.start_line).toBe(10);
        expect(retrieved?.end_line).toBe(20);
        expect(retrieved?.byte_offset_start).toBe(100);
        expect(retrieved?.byte_offset_end).toBe(200);
    });

    test('should allow creating modules with metadata', async () => {
        await migrationManager.migrateAll();

        const db = await dbManager.getDatabase('X');
        const moduleRepo = new ModuleRepository(db);
        const pluginId = dbManager.getPluginId();

        const module = {
            id: 'module-1',
            plugin_id: pluginId,
            file_path: 'test.ts',
            content_hash: 'hash1',
            content_markdown: '# Test Module',
            line_count: 100,
            byte_size: 5000,
            deleted_at: null,
            created_at: new Date(),
            updated_at: new Date()
        };

        await moduleRepo.create(module);

        const retrieved = await moduleRepo.getById('module-1', pluginId);
        expect(retrieved).toBeDefined();
        expect(retrieved?.line_count).toBe(100);
        expect(retrieved?.byte_size).toBe(5000);
    });
});

