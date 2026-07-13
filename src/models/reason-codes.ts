/**
 * Global reason codes for runtime diagnostics.
 * Used by all diagnostic tools (vector backend, ingestion, check_status, etc.)
 * to provide machine-readable error/situation codes.
 */

/**
 * Standardized reason codes for runtime diagnostics.
 */
export enum ReasonCode {
    /** Vector backend is not reachable */
    VECTOR_BACKEND_UNREACHABLE = 'VECTOR_BACKEND_UNREACHABLE',
    
    /** Wrong path configured */
    WRONG_PATH = 'WRONG_PATH',
    
    /** API version is incompatible */
    WRONG_API_VERSION = 'WRONG_API_VERSION',
    
    /** No embeddings available */
    NO_EMBEDDINGS = 'NO_EMBEDDINGS',
    
    /** Permission denied */
    PERMISSION_DENIED = 'PERMISSION_DENIED',
    
    /** Operation timed out */
    TIMEOUT = 'TIMEOUT',
    
    /** System is misconfigured */
    MISCONFIGURED = 'MISCONFIGURED',
    
    /** Required dependency is missing */
    DEPENDENCY_MISSING = 'DEPENDENCY_MISSING',
    
    /** Component is not installed */
    NOT_INSTALLED = 'NOT_INSTALLED',
    
    /** Service is not running */
    NOT_RUNNING = 'NOT_RUNNING',
    
    /** Workspace is not mounted (source code unavailable) */
    NOT_MOUNTED = 'NOT_MOUNTED',
    
    /** Path mapping is missing (for snapshot imports) */
    PATH_MAPPING_MISSING = 'PATH_MAPPING_MISSING',
    
    /** File not found */
    FILE_NOT_FOUND = 'FILE_NOT_FOUND',
    
    /** Hash mismatch (code changed since scan) */
    HASH_MISMATCH = 'HASH_MISMATCH',
    
    /** Legacy symbol cleanup (unknown:// replaced by ts://) */
    LEGACY_CLEANUP = 'LEGACY_CLEANUP',
    
    /** Everything is OK (no error) */
    OK = 'OK'
}

/**
 * Helper function to parse a string to ReasonCode.
 * Returns the ReasonCode if valid, otherwise returns undefined.
 */
export function parseReasonCode(code: string): ReasonCode | undefined {
    if (Object.values(ReasonCode).includes(code as ReasonCode)) {
        return code as ReasonCode;
    }
    return undefined;
}

/**
 * Helper function to get a human-readable description for a reason code.
 */
export function getReasonCodeDescription(code: ReasonCode): string {
    const descriptions: Record<ReasonCode, string> = {
        [ReasonCode.VECTOR_BACKEND_UNREACHABLE]: 'Vector backend is not reachable',
        [ReasonCode.WRONG_PATH]: 'Wrong path configured',
        [ReasonCode.WRONG_API_VERSION]: 'API version is incompatible',
        [ReasonCode.NO_EMBEDDINGS]: 'No embeddings available',
        [ReasonCode.PERMISSION_DENIED]: 'Permission denied',
        [ReasonCode.TIMEOUT]: 'Operation timed out',
        [ReasonCode.MISCONFIGURED]: 'System is misconfigured',
        [ReasonCode.DEPENDENCY_MISSING]: 'Required dependency is missing',
        [ReasonCode.NOT_INSTALLED]: 'Component is not installed',
        [ReasonCode.NOT_RUNNING]: 'Service is not running',
        [ReasonCode.NOT_MOUNTED]: 'Workspace is not mounted (source code unavailable)',
        [ReasonCode.PATH_MAPPING_MISSING]: 'Path mapping is missing (for snapshot imports)',
        [ReasonCode.FILE_NOT_FOUND]: 'File not found',
        [ReasonCode.HASH_MISMATCH]: 'Hash mismatch (code changed since scan)',
        [ReasonCode.LEGACY_CLEANUP]: 'Legacy symbol cleanup (unknown:// replaced by ts://)',
        [ReasonCode.OK]: 'Everything is OK'
    };
    return descriptions[code] || 'Unknown reason code';
}

