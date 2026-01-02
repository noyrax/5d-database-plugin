import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { MultiDbManager } from '../../src/core/multi-db-manager';

describe('MultiDbManager', () => {
    let tempDir: string;
    let dbManager: MultiDbManager;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), '5d-db-test-'));
        dbManager = new MultiDbManager(tempDir);
    });

    afterEach(async () => {
        await dbManager.closeAll();
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    test('should create database directory', () => {
        const dbDir = dbManager.getDbDirectory();
        expect(fs.existsSync(dbDir)).toBe(true);
    });

    test('should generate stable plugin ID', () => {
        const pluginId1 = dbManager.getPluginId();
        const pluginId2 = dbManager.getPluginId();
        expect(pluginId1).toBe(pluginId2);
        expect(pluginId1.length).toBe(16);
    });

    test('should open all 5 dimension databases', async () => {
        const dimensions = ['X', 'Y', 'Z', 'W', 'T'] as const;
        
        for (const dimension of dimensions) {
            const db = await dbManager.getDatabase(dimension);
            expect(db).toBeDefined();
        }

        const openDbs = dbManager.getOpenDatabases();
        expect(openDbs.size).toBe(5);
    });

    test('should close databases', async () => {
        await dbManager.getDatabase('X');
        await dbManager.closeDatabase('X');
        
        const openDbs = dbManager.getOpenDatabases();
        expect(openDbs.has('X')).toBe(false);
    });
});

