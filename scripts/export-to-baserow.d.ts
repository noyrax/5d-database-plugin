#!/usr/bin/env node
/**
 * Export 5D Database Plugin SQLite tables to CSV format for Baserow.io import
 *
 * This script exports all tables from all dimension databases (X, Y, Z, W, T, V)
 * to CSV files that can be imported into Baserow.io.
 *
 * Usage:
 *   node scripts/export-to-baserow.ts [workspace-root] [output-dir]
 *
 * Output:
 *   Creates CSV files in output-dir (default: ./baserow-export/)
 *   One CSV file per table, named: {dimension}_{table_name}.csv
 */
export {};
//# sourceMappingURL=export-to-baserow.d.ts.map