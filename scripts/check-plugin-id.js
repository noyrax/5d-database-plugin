#!/usr/bin/env node

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const workspaceRoot = process.argv[2] || process.cwd();
const modulesDbPath = path.join(workspaceRoot, '.database-plugin', 'modules.db');

if (!fs.existsSync(modulesDbPath)) {
    console.error(`ERROR: modules.db not found at ${modulesDbPath}`);
    process.exit(1);
}

const db = new sqlite3.Database(modulesDbPath, (err) => {
    if (err) {
        console.error(`ERROR: Failed to open modules.db: ${err.message}`);
        process.exit(1);
    }
});

// Get all unique plugin IDs
db.all("SELECT DISTINCT plugin_id FROM modules", (err, rows) => {
    if (err) {
        console.error(`ERROR: Failed to query plugin IDs: ${err.message}`);
        db.close();
        process.exit(1);
    }
    
    console.log('📋 Plugin IDs found in modules.db:');
    if (rows.length === 0) {
        console.log('  ⚠️  No modules found');
    } else {
        rows.forEach(row => {
            console.log(`  - "${row.plugin_id}"`);
        });
    }
    
    // Get module count per plugin ID
    db.all("SELECT plugin_id, COUNT(*) as count FROM modules GROUP BY plugin_id", (err, countRows) => {
        if (err) {
            console.error(`ERROR: Failed to query module counts: ${err.message}`);
            db.close();
            process.exit(1);
        }
        
        console.log('\n📊 Module counts per plugin ID:');
        countRows.forEach(row => {
            console.log(`  - "${row.plugin_id}": ${row.count} modules`);
        });
        
        db.close();
    });
});

