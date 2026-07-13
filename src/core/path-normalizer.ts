import * as path from 'path';

/**
 * Utility class for path normalization (case-preserving).
 * 
 * Key principles:
 * - File paths are case-preserving on all platforms (for Git case-sensitive repositories)
 * - Plugin IDs use lowercase normalization (via normalizeForPluginId in WorkspaceResolver)
 * - Path comparison is case-insensitive on Windows, case-sensitive on Unix
 */
export class PathNormalizer {
    /**
     * Normalizes a file path (case-preserving).
     * 
     * Rules:
     * - Windows → Unix slashes (\ → /)
     * - Trailing slashes entfernen
     * - Multiple slashes vereinfachen
     * - Case BEHALTEN (case-preserving)
     * 
     * @param filePath Path to normalize
     * @returns Normalized path (POSIX-style, case-preserved)
     */
    public static normalizePath(filePath: string): string {
        if (!filePath) {
            return '';
        }

        // Resolve to absolute path (normalizes . and ..)
        const resolved = path.resolve(filePath);
        
        // Convert backslashes to forward slashes (Windows → Unix)
        let normalized = resolved.replace(/\\/g, '/');
        
        // Remove trailing slashes (except root path)
        if (normalized.length > 1 && normalized.endsWith('/')) {
            normalized = normalized.slice(0, -1);
        }
        
        // Simplify multiple slashes (but preserve leading // for UNC paths)
        if (normalized.startsWith('//')) {
            // UNC path (\\server\share) - keep double slash, simplify rest
            normalized = '//' + normalized.substring(2).replace(/\/+/g, '/');
        } else {
            normalized = normalized.replace(/\/+/g, '/');
        }
        
        // Case is preserved - NO toLowerCase()!
        return normalized;
    }

    /**
     * Cross-platform path comparison (case-insensitive on Windows, case-sensitive on Unix).
     * 
     * @param p1 First path
     * @param p2 Second path
     * @returns True if paths are equal (considering platform case-sensitivity)
     */
    public static pathsEqual(p1: string, p2: string): boolean {
        const normalized1 = this.normalizePath(p1);
        const normalized2 = this.normalizePath(p2);
        
        if (process.platform === 'win32') {
            // Case-insensitive comparison on Windows
            return normalized1.toLowerCase() === normalized2.toLowerCase();
        } else {
            // Case-sensitive comparison on Unix
            return normalized1 === normalized2;
        }
    }

    /**
     * Generates lookup variants for queries (forward slashes, leading slash, plugin prefixes, etc.).
     * 
     * This is used for querying where paths might be stored with different formats:
     * - With/without plugin prefixes (5d-database-plugin/, documentation-system-plugin/, mcp-server/)
     * - With/without leading slashes
     * - Different slash directions (normalized to forward slashes)
     * 
     * Note: This is for QUERIES only, not for storage. Storage uses normalizePath().
     * 
     * @param filePath Path to generate variants for
     * @returns Array of path variants for query matching
     */
    public static generateLookupVariants(filePath: string): string[] {
        const variants: string[] = [];

        // Normalize separators to forward slashes (case-preserving)
        let normalized = filePath.replace(/\\/g, '/');
        variants.push(normalized);

        // Remove leading slashes
        const withoutLeadingSlash = normalized.replace(/^\/+/, '');
        if (withoutLeadingSlash !== normalized) {
            variants.push(withoutLeadingSlash);
        }

        const pluginPrefixes = ['5d-database-plugin/', 'documentation-system-plugin/', 'mcp-server/'];

        // Remove common plugin prefixes (e.g., "5d-database-plugin/")
        for (const prefix of pluginPrefixes) {
            if (normalized.startsWith(prefix)) {
                const withoutPrefix = normalized.substring(prefix.length);
                variants.push(withoutPrefix);
            }
            // Also try without leading slash
            if (withoutLeadingSlash.startsWith(prefix)) {
                const withoutPrefix = withoutLeadingSlash.substring(prefix.length);
                variants.push(withoutPrefix);
            }
        }

        // ADD variants WITH plugin prefixes (if path doesn't already have one)
        // This handles cases where modules are stored with plugin prefix but queried without
        const hasPluginPrefix = pluginPrefixes.some(prefix =>
            normalized.startsWith(prefix) || withoutLeadingSlash.startsWith(prefix)
        );

        if (!hasPluginPrefix) {
            // Add variants with each plugin prefix
            for (const prefix of pluginPrefixes) {
                variants.push(`${prefix}${withoutLeadingSlash}`);
                variants.push(`${prefix}${normalized}`);
            }
        }

        // Remove duplicates and return (preserve order)
        return Array.from(new Set(variants));
    }
}
