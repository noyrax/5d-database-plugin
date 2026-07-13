#!/usr/bin/env node

/**
 * Export 5D Database Plugin SQLite tables to CSV format for Baserow.io import
 * 
 * Usage:
 *   node 5d-database-plugin/scripts/export-to-baserow.js [workspace-root] [output-dir]
 */

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const DIMENSION_DB_FILES = {
    X: 'modules.db',
    Y: 'symbols.db',
    Z: 'dependencies.db',
    W: 'adrs.db',
    T: 'changes.db',
    V: 'vectors.db'
};

function escapeCsvField(value) {
    if (value === null || value === undefined) {
        return '';
    }
    
    const str = String(value);
    
    if (str.includes(',') || str.includes('\n') || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    
    return str;
}

function rowToCsv(row, columns) {
    return columns.map(col => escapeCsvField(row[col])).join(',');
}

function getTables(db) {
    return new Promise((resolve, reject) => {
        db.all(
            "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'migrations' ORDER BY name",
            (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            }
        );
    });
}

function getColumns(db, tableName) {
    return new Promise((resolve, reject) => {
        db.all(`PRAGMA table_info(${tableName})`, (err, rows) => {
            if (err) reject(err);
            else resolve(rows.map(r => r.name));
        });
    });
}

function getRows(db, tableName) {
    return new Promise((resolve, reject) => {
        db.all(`SELECT * FROM ${tableName}`, (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

async function exportTableToCsv(db, tableName, outputPath) {
    console.log(`  Exporting table: ${tableName}...`);
    
    const columns = await getColumns(db, tableName);
    const rows = await getRows(db, tableName);
    
    const header = columns.join(',');
    
    // Use streaming for large tables to avoid memory issues
    const writeStream = fs.createWriteStream(outputPath, { encoding: 'utf-8' });
    writeStream.write(header + '\n');
    
    let rowCount = 0;
    for (const row of rows) {
        const csvLine = rowToCsv(row, columns) + '\n';
        writeStream.write(csvLine);
        rowCount++;
        
        // Progress indicator for large tables
        if (rowCount % 1000 === 0) {
            process.stdout.write(`    ... ${rowCount} rows\r`);
        }
    }
    
    writeStream.end();
    
    // Wait for stream to finish
    await new Promise((resolve) => {
        writeStream.on('finish', resolve);
    });
    
    console.log(`    ✓ Exported ${rowCount} rows to ${outputPath}`);
}

async function exportDimension(dimension, dbPath, outputDir) {
    if (!fs.existsSync(dbPath)) {
        console.log(`  ⚠️  Database not found: ${dbPath}`);
        return;
    }
    
    console.log(`\n📦 Exporting ${dimension}-Dimension: ${path.basename(dbPath)}`);
    
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
            if (err) {
                console.error(`  ❌ Failed to open database: ${err.message}`);
                reject(err);
                return;
            }
            
            getTables(db)
                .then(async (tables) => {
                    if (tables.length === 0) {
                        console.log(`  ⚠️  No tables found in database`);
                        db.close();
                        resolve();
                        return;
                    }
                    
                    for (const table of tables) {
                        const outputPath = path.join(outputDir, `${dimension}_${table.name}.csv`);
                        await exportTableToCsv(db, table.name, outputPath);
                    }
                    
                    db.close();
                    resolve();
                })
                .catch((err) => {
                    db.close();
                    reject(err);
                });
        });
    });
}

async function main() {
    const workspaceRoot = process.argv[2] || process.cwd();
    const outputDir = process.argv[3] || path.join(workspaceRoot, 'baserow-export');
    const dbDirectory = path.join(workspaceRoot, '.database-plugin');
    
    console.log('🚀 Exporting 5D Database Plugin tables to CSV for Baserow.io');
    console.log(`   Workspace: ${workspaceRoot}`);
    console.log(`   Output: ${outputDir}`);
    console.log(`   Database directory: ${dbDirectory}`);
    
    if (!fs.existsSync(dbDirectory)) {
        console.error(`\n❌ ERROR: Database directory not found: ${dbDirectory}`);
        console.error(`   Please run ingestion first:`);
        console.error(`   node 5d-database-plugin/out/cli/ingest-cli.js ${workspaceRoot}`);
        process.exit(1);
    }
    
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
        console.log(`\n📁 Created output directory: ${outputDir}`);
    }
    
    const exportPromises = [];
    for (const [dimension, dbFile] of Object.entries(DIMENSION_DB_FILES)) {
        const dbPath = path.join(dbDirectory, dbFile);
        exportPromises.push(exportDimension(dimension, dbPath, outputDir));
    }
    
    await Promise.all(exportPromises);
    
    const summaryPath = path.join(outputDir, 'EXPORT_SUMMARY.md');
    const summary = `# Baserow.io Export Summary

Generated: ${new Date().toISOString()}

## Exported Tables

${Object.entries(DIMENSION_DB_FILES).map(([dim, file]) => {
    const dbPath = path.join(dbDirectory, file);
    if (fs.existsSync(dbPath)) {
        return `- **${dim}-Dimension** (${file}): Tables exported with prefix \`${dim}_\``;
    } else {
        return `- **${dim}-Dimension** (${file}): ⚠️ Database not found`;
    }
}).join('\n')}

## Import Instructions for Baserow.io

1. **Create a new workspace** in Baserow.io
2. **For each CSV file:**
   - Click "Create table" → "Import from file"
   - Select the CSV file
   - Baserow.io will auto-detect columns
   - Review and adjust column types if needed
   - Click "Import"

3. **Table Naming Convention:**
   - Files are named: \`{dimension}_{table_name}.csv\`
   - Example: \`X_modules.csv\`, \`Y_symbols.csv\`, etc.

4. **Relationships:**
   - Foreign key relationships are preserved in the data
   - You may need to recreate them manually in Baserow.io using Link fields

## Dimensions

- **X-Dimension**: Modules (Module documentation)
- **Y-Dimension**: Symbols (Symbol definitions)
- **Z-Dimension**: Dependencies (Module dependencies)
- **W-Dimension**: ADRs (Architecture Decision Records)
- **T-Dimension**: Changes (Change reports)
- **V-Dimension**: Vectors (Embeddings and importance scores)

## Notes

- Large text fields (like \`content_markdown\`) are exported as-is
- BLOB fields (like \`embedding_vector\`) are exported as base64 strings
- Dates are exported in ISO format
- NULL values are exported as empty strings
`;

    fs.writeFileSync(summaryPath, summary, 'utf-8');
    console.log(`\n✅ Export complete!`);
    console.log(`   Summary: ${summaryPath}`);
    console.log(`   CSV files: ${outputDir}`);
    console.log(`\n📋 Next steps:`);
    console.log(`   1. Open Baserow.io`);
    console.log(`   2. Create a new workspace`);
    console.log(`   3. Import each CSV file as a new table`);
    console.log(`   4. See ${summaryPath} for detailed instructions`);
}

main().catch((err) => {
    console.error('\n❌ ERROR:', err);
    process.exit(1);
});
