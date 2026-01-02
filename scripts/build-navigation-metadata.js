#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const { config } = require('dotenv');

// Load .env file
function loadEnvFile(workspaceRoot) {
    let currentPath = workspaceRoot;
    const maxDepth = 5;
    
    for (let depth = 0; depth < maxDepth; depth++) {
        const envPath = path.join(currentPath, '.env');
        if (fs.existsSync(envPath)) {
            config({ path: envPath });
            console.log(`[Script] Loaded .env file from: ${envPath}`);
            return;
        }
        
        const parentPath = path.dirname(currentPath);
        if (parentPath === currentPath) {
            break;
        }
        currentPath = parentPath;
    }
    
    console.warn('[Script] No .env file found. Using environment variables only.');
}

async function main() {
    const workspaceRoot = process.argv[2] || process.cwd();
    loadEnvFile(workspaceRoot);

    // Import after .env is loaded
    const { MultiDbManager } = require('../out/core/multi-db-manager');
    const { MigrationManager } = require('../out/core/migration-manager');
    const { ImportanceScorer } = require('../out/services/importance-scorer');
    const { NavigationBuilder } = require('../out/services/navigation-builder');
    const { DocsPathResolver } = require('../out/core/docs-path-resolver');

    console.log(`[Script] Building navigation metadata for workspace: ${workspaceRoot}`);

    // Initialize database manager first
    const dbManager = new MultiDbManager(workspaceRoot);
    const migrationManager = new MigrationManager(dbManager, path.join(__dirname, '..'));

    // Detect plugin ID from database
    // Query database directly to get plugin IDs
    const modulesDb = await dbManager.getDatabase('X');
    const pluginIds = await new Promise((resolve, reject) => {
        modulesDb.all("SELECT DISTINCT plugin_id FROM modules", (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows.map(r => r.plugin_id));
            }
        });
    });
    
    if (pluginIds.length === 0) {
        console.error('ERROR: No modules found in database. Please run ingestion first.');
        process.exit(1);
    }
    
    if (pluginIds.length > 1) {
        console.warn(`WARNING: Multiple plugin IDs found: ${pluginIds.join(', ')}`);
    }
    
    const pluginId = pluginIds[0];
    console.log(`[Script] Using plugin ID: ${pluginId}`);

    // Ensure V-dimension migration is applied
    console.log('[Script] Ensuring V-dimension migration is applied...');
    await migrationManager.migrate('V');

    // Resolve docs path
    const docsPath = DocsPathResolver.findDocsDirectoryFromPath(workspaceRoot);
    
    if (!docsPath) {
        console.error('ERROR: docs/ directory not found. Please run Noyrax first.');
        process.exit(1);
    }

    console.log(`[Script] Using docs path: ${docsPath}`);

    // Calculate importance scores first (required for entry point identification)
    console.log('[Script] Calculating importance scores...');
    const importanceScorer = new ImportanceScorer(dbManager);
    await importanceScorer.calculateCombinedScores(pluginId);

    // Build navigation metadata
    console.log('[Script] Building navigation metadata...');
    const navigationBuilder = new NavigationBuilder(dbManager);
    await navigationBuilder.buildMetadata(pluginId);

    console.log('[Script] ✅ Navigation metadata built successfully!');

    // Verify
    const db = await dbManager.getDatabase('V');
    const { NavigationRepository } = require('../out/repositories/navigation-repository');
    const navRepo = new NavigationRepository(db);
    const entryPoints = await navRepo.getEntryPoints('X', pluginId);
    console.log(`[Script] Found ${entryPoints.length} entry points`);

    // Close all database connections
    // Note: MultiDbManager doesn't have a close() method, connections are managed automatically
}

main().catch(err => {
    console.error('ERROR:', err);
    process.exit(1);
});

