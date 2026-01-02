#!/usr/bin/env node

/**
 * Debug Tool: Plugin ID Verification
 * 
 * Verifies plugin ID calculation and checks database for matching plugin IDs.
 * Useful for debugging foreign system issues where plugin IDs don't match.
 */

import * as path from 'path';
import * as crypto from 'crypto';
import * as sqlite3 from 'sqlite3';
import * as fs from 'fs';

interface PluginIdInfo {
    workspaceRoot: string;
    normalizedPath: string;
    calculatedPluginId: string;
    databasePluginIds: string[];
    match: boolean;
}

/**
 * Calculates plugin ID using the same method as MultiDbManager.
 */
function calculatePluginId(workspaceRoot: string): string {
    const normalizedPath = path.resolve(workspaceRoot).replace(/\\/g, '/').toLowerCase();
    const hash = crypto.createHash('sha256').update(normalizedPath).digest('hex');
    return hash.substring(0, 16);
}

/**
 * Gets all unique plugin IDs from a database.
 */
function getPluginIdsFromDatabase(dbPath: string, tableName: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(dbPath)) {
            resolve([]);
            return;
        }

        const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
            if (err) {
                reject(err);
                return;
            }
        });

        db.all(
            `SELECT DISTINCT plugin_id FROM ${tableName} WHERE plugin_id IS NOT NULL`,
            [],
            (err, rows: Array<{ plugin_id: string }>) => {
                db.close();
                if (err) {
                    reject(err);
                } else {
                    resolve(rows.map(r => r.plugin_id));
                }
            }
        );
    });
}

/**
 * Main debug function.
 */
async function debugPluginId(workspaceRoot: string): Promise<void> {
    console.log('=== Plugin ID Debug Tool ===\n');
    console.log(`Workspace Root: ${workspaceRoot}\n`);

    // 1. Calculate plugin ID
    const calculatedPluginId = calculatePluginId(workspaceRoot);
    const normalizedPath = path.resolve(workspaceRoot).replace(/\\/g, '/').toLowerCase();
    
    console.log('1. Plugin ID Calculation:');
    console.log(`   Normalized Path: ${normalizedPath}`);
    console.log(`   Calculated Plugin ID: ${calculatedPluginId}\n`);

    // 2. Check databases
    const dbDirectory = path.join(workspaceRoot, '.database-plugin');
    if (!fs.existsSync(dbDirectory)) {
        console.log('2. Database Directory:');
        console.log(`   ❌ Not found: ${dbDirectory}`);
        console.log(`   → Run ingestion first: noyrax-5d-database ingest <workspace-root>`);
        return;
    }

    console.log('2. Database Plugin IDs:');
    
    const dbFiles = [
        { file: 'modules.db', table: 'modules', name: 'X (Modules)' },
        { file: 'symbols.db', table: 'symbols', name: 'Y (Symbols)' },
        { file: 'dependencies.db', table: 'dependencies', name: 'Z (Dependencies)' },
        { file: 'adrs.db', table: 'adrs', name: 'W (ADRs)' },
        { file: 'changes.db', table: 'change_reports', name: 'T (Changes)' }
    ];

    const allPluginIds = new Set<string>();

    for (const { file, table, name } of dbFiles) {
        const dbPath = path.join(dbDirectory, file);
        try {
            const pluginIds = await getPluginIdsFromDatabase(dbPath, table);
            console.log(`   ${name}:`);
            if (pluginIds.length === 0) {
                console.log(`      ⚠️  No plugin IDs found (database empty or table doesn't exist)`);
            } else {
                pluginIds.forEach(id => {
                    allPluginIds.add(id);
                    const match = id === calculatedPluginId;
                    console.log(`      ${match ? '✅' : '❌'} ${id} ${match ? '(MATCH)' : '(MISMATCH)'}`);
                });
            }
        } catch (error: any) {
            console.log(`   ${name}:`);
            console.log(`      ❌ Error: ${error.message}`);
        }
    }

    console.log('\n3. Summary:');
    if (allPluginIds.size === 0) {
        console.log('   ⚠️  No plugin IDs found in databases');
        console.log('   → Run ingestion first: noyrax-5d-database ingest <workspace-root>');
    } else if (allPluginIds.has(calculatedPluginId)) {
        console.log(`   ✅ Plugin ID matches: ${calculatedPluginId}`);
        console.log('   → All queries should work correctly');
    } else {
        console.log(`   ❌ Plugin ID mismatch!`);
        console.log(`   → Calculated: ${calculatedPluginId}`);
        console.log(`   → In Database: ${Array.from(allPluginIds).join(', ')}`);
        console.log('\n   Possible causes:');
        console.log('   1. Workspace root changed after ingestion');
        console.log('   2. Ingestion was run with different workspace root');
        console.log('   3. Plugin ID calculation method changed');
        console.log('\n   Solution:');
        console.log('   → Re-run ingestion with current workspace root:');
        console.log(`     noyrax-5d-database ingest "${workspaceRoot}" --full`);
    }

    console.log('\n4. Verification Query:');
    const modulesDb = path.join(dbDirectory, 'modules.db');
    if (fs.existsSync(modulesDb)) {
        try {
            const db = new sqlite3.Database(modulesDb, sqlite3.OPEN_READONLY);
            db.get(
                `SELECT COUNT(*) as count FROM modules WHERE plugin_id = ?`,
                [calculatedPluginId],
                (err, row: { count: number } | undefined) => {
                    db.close();
                    if (err) {
                        console.log(`   ❌ Error: ${err.message}`);
                    } else {
                        const count = row?.count || 0;
                        console.log(`   Modules with calculated Plugin ID: ${count}`);
                        if (count === 0) {
                            console.log('   ⚠️  No modules found with calculated Plugin ID');
                        } else {
                            console.log(`   ✅ Found ${count} module(s) with matching Plugin ID`);
                        }
                    }
                }
            );
        } catch (error: any) {
            console.log(`   ❌ Error: ${error.message}`);
        }
    } else {
        console.log('   ⚠️  modules.db not found');
    }
}

// CLI entry point
const workspaceRoot = process.argv[2] || process.cwd();
debugPluginId(workspaceRoot).catch(error => {
    console.error('Error:', error);
    process.exit(1);
});

