#!/usr/bin/env node

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const workspaceRoot = process.argv[2] || process.cwd();
const vectorsDbPath = path.join(workspaceRoot, '.database-plugin', 'vectors.db');

if (!fs.existsSync(vectorsDbPath)) {
    console.error(`ERROR: vectors.db not found at ${vectorsDbPath}`);
    process.exit(1);
}

const db = new sqlite3.Database(vectorsDbPath, (err) => {
    if (err) {
        console.error(`ERROR: Failed to open vectors.db: ${err.message}`);
        process.exit(1);
    }
});

// Check if navigation_metadata table exists
db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='navigation_metadata'", (err, rows) => {
    if (err) {
        console.error(`ERROR: Failed to query tables: ${err.message}`);
        db.close();
        process.exit(1);
    }
    
    if (rows.length === 0) {
        console.log('❌ navigation_metadata table does NOT exist');
    } else {
        console.log('✅ navigation_metadata table exists');
    }
});

// List all tables
db.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name", (err, rows) => {
    if (err) {
        console.error(`ERROR: Failed to list tables: ${err.message}`);
        db.close();
        process.exit(1);
    }
    
    console.log('\n📋 All tables in vectors.db:');
    rows.forEach(row => {
        console.log(`  - ${row.name}`);
    });
    
    // Check migrations
    db.all("SELECT version, name, applied_at FROM migrations ORDER BY version", (err, migrationRows) => {
        if (err) {
            console.error(`ERROR: Failed to query migrations: ${err.message}`);
            db.close();
            process.exit(1);
        }
        
        console.log('\n📦 Applied migrations:');
        if (migrationRows.length === 0) {
            console.log('  ⚠️  No migrations found');
        } else {
            migrationRows.forEach(m => {
                console.log(`  - ${m.version}_${m.name} (applied at ${m.applied_at})`);
            });
        }
        
        db.close();
    });
});

