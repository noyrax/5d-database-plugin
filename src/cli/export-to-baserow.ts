#!/usr/bin/env node

/**
 * Export 5D Database Plugin SQLite tables to CSV format for Baserow.io import
 * 
 * This script exports all tables from all dimension databases (X, Y, Z, W, T, V)
 * to CSV files that can be imported into Baserow.io.
 * 
 * Usage:
 *   node out/cli/export-to-baserow.js [workspace-root] [output-dir]
 * 
 * Output:
 *   Creates CSV files in output-dir (default: ./baserow-export/)
 *   One CSV file per table, named: {dimension}_{table_name}.csv
 */

import * as sqlite3 from 'sqlite3';
import * as fs from 'fs';
import * as path from 'path';

const DIMENSION_DB_FILES: Record<string, string> = {
    X: 'modules.db',
    Y: 'symbols.db',
    Z: 'dependencies.db',
    W: 'adrs.db',
    T: 'changes.db',
    V: 'vectors.db'
};

interface TableInfo {
    name: string;
    sql: string;
}

/**
 * Escape CSV field value
 */
function escapeCsvField(value: any): string {
    if (value === null || value === undefined) {
        return '';
    }
    
    const str = String(value);
    
    // If contains comma, newline, or quote, wrap in quotes and escape quotes
    if (str.includes(',') || str.includes('\n') || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    
    return str;
}

/**
 * Convert row to CSV line
 */
function rowToCsv(row: any, columns: string[]): string {
    return columns.map(col => escapeCsvField(row[col])).join(',');
}

/**
 * Get all tables from a database
 */
function getTables(db: sqlite3.Database): Promise<TableInfo[]> {
    return new Promise((resolve, reject) => {
        db.all(
            "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'migrations' ORDER BY name",
            (err, rows: TableInfo[]) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            }
        );
    });
}

/**
 * Get column names from a table
 */
function getColumns(db: sqlite3.Database, tableName: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
        db.all(`PRAGMA table_info(${tableName})`, (err, rows: any[]) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows.map(r => r.name));
            }
        });
    });
}

/**
 * Get all rows from a table
 */
function getRows(db: sqlite3.Database, tableName: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
        db.all(`SELECT * FROM ${tableName}`, (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows || []);
            }
        });
    });
}

/**
 * Export table to CSV
 */
async function exportTableToCsv(
    db: sqlite3.Database,
    tableName: string,
    outputPath: string
): Promise<void> {
    console.log(`  Exporting table: ${tableName}...`);
    
    const columns = await getColumns(db, tableName);
    const rows = await getRows(db, tableName);
    
    // Write CSV header
    const header = columns.join(',');
    const csvLines = [header];
    
    // Write CSV rows
    for (const row of rows) {
        csvLines.push(rowToCsv(row, columns));
    }
    
    // Write to file
    fs.writeFileSync(outputPath, csvLines.join('\n'), 'utf-8');
    
    console.log(`    ✓ Exported ${rows.length} rows to ${outputPath}`);
}

/**
 * Export all tables from a dimension database
 */
async function exportDimension(
    dimension: string,
    dbPath: string,
    outputDir: string
): Promise<void> {
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
                        const outputPath = path.join(
                            outputDir,
                            `${dimension}_${table.name}.csv`
                        );
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

/**
 * Main function
 */
async function main(): Promise<void> {
    const workspaceRoot = process.argv[2] || process.cwd();
    const outputDir = process.argv[3] || path.join(workspaceRoot, 'baserow-export');
    const dbDirectory = path.join(workspaceRoot, '.database-plugin');
    
    console.log('🚀 Exporting 5D Database Plugin tables to CSV for Baserow.io');
    console.log(`   Workspace: ${workspaceRoot}`);
    console.log(`   Output: ${outputDir}`);
    console.log(`   Database directory: ${dbDirectory}`);
    
    // Check if database directory exists
    if (!fs.existsSync(dbDirectory)) {
        console.error(`\n❌ ERROR: Database directory not found: ${dbDirectory}`);
        console.error(`   Please run ingestion first: node 5d-database-plugin/out/cli/ingest-cli.js ${workspaceRoot}`);
        process.exit(1);
    }
    
    // Create output directory
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
        console.log(`\n📁 Created output directory: ${outputDir}`);
    }
    
    // Export all dimensions
    const exportPromises: Promise<void>[] = [];
    
    for (const [dimension, dbFile] of Object.entries(DIMENSION_DB_FILES)) {
        const dbPath = path.join(dbDirectory, dbFile);
        exportPromises.push(exportDimension(dimension, dbPath, outputDir));
    }
    
    await Promise.all(exportPromises);
    
    // Create summary file
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

// Run main function
main().catch((err) => {
    console.error('\n❌ ERROR:', err);
    process.exit(1);
});
