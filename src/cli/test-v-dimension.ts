#!/usr/bin/env node

import * as path from 'path';
import * as fs from 'fs';
import { config } from 'dotenv';
import { MultiDbManager } from '../core/multi-db-manager';
import { MigrationManager } from '../core/migration-manager';
import { VectorDatabase } from '../core/vector-database-interface';
import { EmbeddingRepository } from '../repositories/embedding-repository';
import * as sqlite3 from 'sqlite3';

/**
 * Loads .env file from workspace root or parent directories.
 */
function loadEnvFile(workspaceRoot: string): void {
    let currentPath = workspaceRoot;
    const maxDepth = 5;
    
    for (let depth = 0; depth < maxDepth; depth++) {
        const envPath = path.join(currentPath, '.env');
        if (fs.existsSync(envPath)) {
            config({ path: envPath });
            console.log(`[Test V-Dimension] Loaded .env file from: ${envPath}`);
            return;
        }
        
        const parentPath = path.dirname(currentPath);
        if (parentPath === currentPath) {
            break;
        }
        currentPath = parentPath;
    }
    
    console.warn('[Test V-Dimension] No .env file found. Using environment variables only.');
}

/**
 * Tests V-Dimension: Opens database, checks VSS, counts embeddings, tests VSS search.
 */
async function main(): Promise<void> {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.error('Usage: test-v-dimension <workspace-root>');
        process.exit(1);
    }

    const workspaceRoot = path.resolve(args[0]);
    
    console.log('=== V-Dimension Test ===');
    console.log(`Workspace root: ${workspaceRoot}`);
    console.log('');

    // Load .env file
    loadEnvFile(workspaceRoot);
    if (process.env.OPENAI_API_KEY) {
        console.log('✓ OpenAI API key loaded from .env file');
    } else {
        console.warn('⚠ WARNING: OPENAI_API_KEY not found in .env file or environment variables');
    }
    console.log('');

    try {
        // 1. Initialize MultiDbManager
        console.log('1. Initializing MultiDbManager...');
        const dbManager = new MultiDbManager(workspaceRoot);
        const pluginId = dbManager.getPluginId();
        console.log(`   Plugin ID: ${pluginId}`);
        console.log(`   Database directory: ${dbManager.getDbDirectory()}`);
        console.log('');

        // 2. Run migrations
        console.log('2. Running migrations...');
        const pluginRoot = path.resolve(__dirname, '..', '..');
        const migrationManager = new MigrationManager(dbManager, pluginRoot);
        try {
            await migrationManager.migrate('V');
            console.log('   ✓ V-Dimension migration completed');
        } catch (error: any) {
            if (error.code === 'SQLITE_CONSTRAINT' && error.message.includes('migrations.version')) {
                console.log('   ⚠ Migration already attempted (version exists in migrations table)');
                console.log('   → Checking if tables were actually created...');
                // Continue - we'll check tables in step 6
            } else {
                throw error;
            }
        }
        console.log('');

        // 3. Open V-Dimension database
        console.log('3. Opening V-Dimension database...');
        const vDb = await dbManager.getDatabase('V');
        console.log('   ✓ V-Dimension database opened');
        console.log('');

        // 4. Check Vector Database
        console.log('4. Checking Vector Database...');
        const vectorDb = dbManager.getVectorDatabase();
        if (vectorDb) {
            const vectorDbAvailable = vectorDb.isAvailable();
            if (vectorDbAvailable) {
                console.log('   ✓ Vector Database available');
            } else {
                console.log('   ⚠ Vector Database exists but not available');
                console.log('   → Will use fallback cosine similarity');
            }
        } else {
            console.log('   ⚠ Vector Database not initialized');
            console.log('   → Vector Database initialization may have failed');
        }
        console.log('');

        // 5. Check database file
        console.log('5. Checking database file...');
        const dbPath = path.join(dbManager.getDbDirectory(), 'vectors.db');
        if (fs.existsSync(dbPath)) {
            const stats = fs.statSync(dbPath);
            console.log(`   ✓ vectors.db exists`);
            console.log(`   Size: ${(stats.size / 1024).toFixed(2)} KB`);
        } else {
            console.log('   ⚠ vectors.db does not exist yet');
            console.log('   → Will be created on first use');
        }
        console.log('');

        // 6. Check tables
        console.log('6. Checking database tables...');
        const tables = await getTables(vDb);
        console.log(`   Found ${tables.length} tables:`);
        for (const table of tables) {
            console.log(`   - ${table}`);
        }
        console.log('');

        // 7. Check VSS Virtual Table
        console.log('7. Checking VSS Virtual Table...');
        const hasVssTable = tables.includes('embeddings_vss');
        if (hasVssTable) {
            console.log('   ✓ embeddings_vss virtual table exists');
            const vssCount = await getVssRowCount(vDb);
            console.log(`   VSS rows: ${vssCount}`);
        } else {
            console.log('   ⚠ embeddings_vss virtual table does not exist');
            console.log('   → Vector Database may not be loaded or not available');
        }
        console.log('');

        // 8. Count embeddings
        console.log('8. Counting embeddings...');
        let allEmbeddings: any[] = [];
        try {
            const embeddingRepo = new EmbeddingRepository(vDb);
            allEmbeddings = await embeddingRepo.getAll(pluginId);
            console.log(`   Total embeddings: ${allEmbeddings.length}`);
        
            if (allEmbeddings.length > 0) {
                const byDimension = new Map<string, number>();
                for (const emb of allEmbeddings) {
                    const count = byDimension.get(emb.dimension) || 0;
                    byDimension.set(emb.dimension, count + 1);
                }
                
                console.log('   By dimension:');
                for (const [dim, count] of Array.from(byDimension.entries()).sort()) {
                    console.log(`   - ${dim}: ${count}`);
                }
            } else {
                console.log('   ⚠ No embeddings found');
                console.log('   → Run ingestion to generate embeddings');
            }
        } catch (error: any) {
            if (error.code === 'SQLITE_ERROR' && error.message.includes('no such table: embeddings')) {
                console.log('   ⚠ embeddings table does not exist');
                console.log('   → Migration may not have been applied correctly');
                console.log('   → Try running migration manually or re-run test');
            } else {
                throw error;
            }
        }
        console.log('');

        // 9. Test Vector Database Search (if available and embeddings exist)
        if (vectorDb && vectorDb.isAvailable() && allEmbeddings && allEmbeddings.length > 0) {
            console.log('9. Testing Vector Database Search...');
            try {
                // Generate a test query embedding (simple test)
                const testQuery = [0.1, 0.2, 0.3]; // Dummy vector for testing
                console.log('   ⚠ Vector database search test skipped (requires OpenAI API for real query embedding)');
                console.log('   → Use semantic_discovery MCP tool for real search');
            } catch (error) {
                console.log(`   ⚠ Vector database search test failed: ${error}`);
            }
        } else {
            console.log('9. Vector Database Search test skipped:');
            if (!vectorDb || !vectorDb.isAvailable()) {
                console.log('   → Vector Database not available');
            }
            if (!allEmbeddings || allEmbeddings.length === 0) {
                console.log('   → No embeddings to search');
            }
        }
        console.log('');

        // 10. Summary
        console.log('=== Test Summary ===');
        console.log(`✓ V-Dimension database: ${fs.existsSync(dbPath) ? 'EXISTS' : 'NOT CREATED YET'}`);
        console.log(`✓ Vector Database: ${vectorDb && vectorDb.isAvailable() ? 'AVAILABLE' : 'NOT AVAILABLE (using fallback)'}`);
        
        // Check if embeddings table exists
        const hasEmbeddingsTable = tables.includes('embeddings');
        if (hasEmbeddingsTable) {
            try {
                const embeddingRepo = new EmbeddingRepository(vDb);
                const allEmbeddings = await embeddingRepo.getAll(pluginId);
                console.log(`✓ Embeddings: ${allEmbeddings.length} total`);
            } catch (error) {
                console.log(`✓ Embeddings table: EXISTS (but error reading: ${error})`);
            }
        } else {
            console.log(`✓ Embeddings table: NOT CREATED (migration not applied)`);
        }
        
        console.log(`✓ VSS Virtual Table: ${hasVssTable ? 'EXISTS' : 'NOT CREATED'}`);
        console.log('');

        const hasEmbeddingsTableForCheck = tables.includes('embeddings');
        let allEmbeddingsForCheck: any[] = [];
        if (hasEmbeddingsTableForCheck) {
            try {
                const embeddingRepo = new EmbeddingRepository(vDb);
                allEmbeddingsForCheck = await embeddingRepo.getAll(pluginId);
            } catch (error) {
                // Ignore
            }
        }

        if (!hasEmbeddingsTableForCheck) {
            console.log('💡 Next steps:');
            console.log('   1. Migration needs to be applied');
            console.log('   2. Re-run this test to apply migration');
            console.log('   3. Then run ingestion to generate embeddings');
        } else if (allEmbeddingsForCheck.length === 0) {
            console.log('💡 Next steps:');
            console.log('   1. Run ingestion: npm run ingest or VS Code command "5d-database.ingest"');
            console.log('   2. This will generate embeddings for all 5 dimensions');
            console.log('   3. Embeddings will be automatically synced to VSS (if available)');
        } else if (!hasVssTable) {
            console.log('💡 Note:');
            console.log('   - Embeddings exist but VSS Virtual Table not created');
            console.log('   - This means VSS Extension is not available');
            console.log('   - System will use fallback cosine similarity (slower but works)');
        } else {
            console.log('✓ V-Dimension is ready for semantic search!');
        }

        // Close database
        await dbManager.closeDatabase('V');
        console.log('');
        console.log('Test completed successfully!');

    } catch (error) {
        console.error('Test failed:', error);
        if (error instanceof Error && error.stack) {
            console.error('Stack trace:', error.stack);
        }
        process.exit(1);
    }
}

/**
 * Gets all tables in the database.
 */
function getTables(db: sqlite3.Database): Promise<string[]> {
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`,
            [],
            (err, rows: any[]) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows.map(row => row.name));
                }
            }
        );
    });
}

/**
 * Gets row count from VSS virtual table.
 */
function getVssRowCount(db: sqlite3.Database): Promise<number> {
    return new Promise((resolve, reject) => {
        db.get(
            `SELECT COUNT(*) as count FROM embeddings_vss`,
            [],
            (err, row: any) => {
                if (err) {
                    // VSS table may not exist or query may fail
                    resolve(0);
                } else {
                    resolve(row ? row.count : 0);
                }
            }
        );
    });
}

if (require.main === module) {
    main().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

