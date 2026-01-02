import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Utility class for finding the docs directory across multiple workspace folders
 * and parent directories. Ensures deterministic behavior by sorting workspace folders.
 */
export class DocsPathResolver {
    /**
     * Finds the docs directory by searching all workspace folders and optionally
     * parent directories. Returns the first found docs directory or null.
     * 
     * @param workspaceFolders Array of workspace folders (can be empty)
     * @param searchParentDirectories Whether to search in parent directories if not found in workspace folders
     * @param maxParentDepth Maximum depth to search in parent directories (default: 5)
     * @returns The path to the docs directory or null if not found
     */
    public static findDocsDirectory(
        workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined,
        searchParentDirectories: boolean = true,
        maxParentDepth: number = 5
    ): string | null {
        // First, search in all workspace folders (deterministically sorted)
        if (workspaceFolders && workspaceFolders.length > 0) {
            // Sort workspace folders alphabetically for determinism
            const sortedFolders = [...workspaceFolders].sort((a, b) => 
                a.uri.fsPath.localeCompare(b.uri.fsPath)
            );

            for (const folder of sortedFolders) {
                const docsPath = this.findDocsInDirectory(folder.uri.fsPath);
                if (docsPath) {
                    return docsPath;
                }
            }

            // If not found in workspace folders and searchParentDirectories is true,
            // search in parent directories of the first workspace folder
            if (searchParentDirectories && sortedFolders.length > 0) {
                const firstFolderPath = sortedFolders[0].uri.fsPath;
                const parentDocsPath = this.findDocsInParentDirectories(firstFolderPath, maxParentDepth);
                if (parentDocsPath) {
                    return parentDocsPath;
                }
            }
        }

        return null;
    }

    /**
     * Checks if a docs directory exists in the given directory.
     * 
     * @param dir The directory to check
     * @returns The path to the docs directory if it exists, null otherwise
     */
    public static findDocsInDirectory(dir: string): string | null {
        const docsPath = path.join(dir, 'docs');
        
        if (fs.existsSync(docsPath)) {
            const stats = fs.statSync(docsPath);
            if (stats.isDirectory()) {
                return docsPath;
            }
        }

        return null;
    }

    /**
     * Searches for a docs directory in parent directories, starting from the given directory.
     * Stops when maxDepth is reached or when the root directory is reached.
     * 
     * @param startDir The directory to start searching from
     * @param maxDepth Maximum number of parent levels to search (default: 5)
     * @returns The path to the docs directory if found, null otherwise
     */
    public static findDocsInParentDirectories(startDir: string, maxDepth: number = 5): string | null {
        let currentDir = path.resolve(startDir);
        let depth = 0;

        while (depth < maxDepth) {
            const docsPath = this.findDocsInDirectory(currentDir);
            if (docsPath) {
                return docsPath;
            }

            const parentDir = path.dirname(currentDir);
            
            // Stop if we've reached the root (parent equals current)
            if (parentDir === currentDir) {
                break;
            }

            currentDir = parentDir;
            depth++;
        }

        return null;
    }

    /**
     * Finds the docs directory from a given path (for CLI usage).
     * Searches in the directory and parent directories.
     * 
     * @param startPath The path to start searching from
     * @param maxDepth Maximum number of parent levels to search (default: 5)
     * @returns The path to the docs directory if found, null otherwise
     */
    public static findDocsDirectoryFromPath(startPath: string, maxDepth: number = 5): string | null {
        // First check in the start directory
        const docsPath = this.findDocsInDirectory(startPath);
        if (docsPath) {
            return docsPath;
        }

        // Then search in parent directories
        return this.findDocsInParentDirectories(startPath, maxDepth);
    }
}

