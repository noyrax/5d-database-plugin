import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { MultiDbManager } from '../../src/core/multi-db-manager';
import { MigrationManager } from '../../src/core/migration-manager';
import { CrossDimensionLinker } from '../../src/services/cross-dimension-linker';
import { IdMapper } from '../../src/core/id-mapper';

describe('Cross-Dimension Integration', () => {
    let tempDir: string;
    let dbManager: MultiDbManager;
    let migrationManager: MigrationManager;
    let linker: CrossDimensionLinker;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), '5d-db-test-'));
        dbManager = new MultiDbManager(tempDir);
        const pluginRoot = path.resolve(__dirname, '..', '..');
        migrationManager = new MigrationManager(dbManager, pluginRoot);
        const idMapper = new IdMapper(dbManager);
        linker = new CrossDimensionLinker(dbManager, idMapper);
    });

    afterEach(async () => {
        await dbManager.closeAll();
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    test('should link symbols to modules', async () => {
        await migrationManager.migrateAll();
        
        const pluginId = dbManager.getPluginId();
        const result = await linker.resolveSymbolToModule('test://symbol', pluginId);
        
        expect(result).toBeNull();
    });

    test('should get ADRs for file path', async () => {
        await migrationManager.migrateAll();
        
        const pluginId = dbManager.getPluginId();
        const result = await linker.getAdrsForFilePath('src/test.ts', pluginId);
        
        expect(Array.isArray(result)).toBe(true);
    });
});

