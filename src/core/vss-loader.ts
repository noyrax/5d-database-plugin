import * as sqlite3 from 'sqlite3';
import * as fs from 'fs';
import * as path from 'path';

// Try to import sqlite-vss
let sqliteVss: any = null;
try {
    sqliteVss = require('sqlite-vss');
} catch (error) {
    // sqlite-vss not available, will use fallback
}

/**
 * Loads SQLite VSS Extension for vector similarity search.
 * Uses sqlite-vss package if available, otherwise falls back to manual path resolution.
 */
export class VssLoader {
    /**
     * Loads the VSS extension into the given database.
     * 
     * @param db The SQLite database instance
     */
    async loadExtension(db: sqlite3.Database): Promise<void> {
        let vssPath: string | null = null;

        // Try to use sqlite-vss package's getVssLoadablePath() method
        if (sqliteVss && typeof sqliteVss.getVssLoadablePath === 'function') {
            try {
                vssPath = sqliteVss.getVssLoadablePath();
                console.log(`[VssLoader] Using sqlite-vss package path: ${vssPath}`);
            } catch (error) {
                console.warn(`[VssLoader] Failed to get VSS path from sqlite-vss package: ${error}`);
            }
        }

        // Fallback: Try manual path resolution
        if (!vssPath || !fs.existsSync(vssPath)) {
            const platform = process.platform;
            const arch = process.arch;
            vssPath = this.getVssPath(platform, arch);
        }

        if (!vssPath || !fs.existsSync(vssPath)) {
            console.warn(`[VssLoader] VSS Extension not found. Semantic search will use fallback cosine similarity.`);
            return;
        }

        return new Promise((resolve, reject) => {
            try {
                db.loadExtension(vssPath, (err) => {
                    if (err) {
                        console.warn(`[VssLoader] Failed to load VSS extension: ${err.message}. Semantic search will use fallback cosine similarity.`);
                        resolve(); // Nicht abbrechen, System soll auch ohne VSS funktionieren
                    } else {
                        console.log(`[VssLoader] VSS extension loaded successfully from ${vssPath}`);
                        resolve();
                    }
                });
            } catch (error) {
                console.warn(`[VssLoader] Error loading VSS extension: ${error}. Semantic search will use fallback cosine similarity.`);
                resolve(); // Nicht abbrechen
            }
        });
    }
    
    /**
     * Gets the path to the VSS extension binary for the current platform.
     * Fallback method if sqlite-vss package is not available.
     * 
     * @param platform The platform (win32, linux, darwin)
     * @param arch The architecture (x64, arm64, etc.)
     * @returns Path to the VSS extension binary
     */
    private getVssPath(platform: string, arch: string): string {
        const extensionName = platform === 'win32' ? 'vss0.dll' : 'vss0.so';
        const basePath = path.join(__dirname, '..', '..', 'node_modules', 'sqlite-vss');
        
        // Try different possible paths
        const possiblePaths = [
            path.join(basePath, 'lib', `vss0.${platform}.${arch}.node`),
            path.join(basePath, `vss0.${platform}.${arch}.node`),
            path.join(basePath, 'lib', extensionName),
            path.join(basePath, extensionName)
        ];

        // Return first existing path, or last as fallback
        for (const possiblePath of possiblePaths) {
            if (fs.existsSync(possiblePath)) {
                return possiblePath;
            }
        }

        return possiblePaths[0]; // Return first path as fallback (will be checked by caller)
    }
    
    /**
     * Checks if VSS extension is available.
     * 
     * @returns true if VSS extension is available, false otherwise
     */
    isAvailable(): boolean {
        // Try sqlite-vss package first
        if (sqliteVss && typeof sqliteVss.getVssLoadablePath === 'function') {
            try {
                const vssPath = sqliteVss.getVssLoadablePath();
                if (vssPath && fs.existsSync(vssPath)) {
                    return true;
                }
            } catch (error) {
                // Fall through to manual check (e.g., unsupported platform like Windows)
            }
        }

        // Fallback: Manual path check
        const platform = process.platform;
        const arch = process.arch;
        const vssPath = this.getVssPath(platform, arch);
        return fs.existsSync(vssPath);
    }
}


