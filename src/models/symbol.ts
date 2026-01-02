/**
 * Y-Dimension: Symbol model
 * Represents a symbol from docs/index/symbols.jsonl
 */
export interface Symbol {
    id: string;  // Internal UUID
    plugin_id: string;
    symbol_id: string;  // External ID from JSONL (e.g., ts://src/core/scanner.ts#scanWorkspace(...))
    path: string;  // Repository-relative source path
    kind: string;  // Symbol kind (class, function, interface, etc.)
    name: string;
    signature_json: string;  // JSON string of signature
    signature_hash: string;  // Hash of signature for change detection
    summary: string | null;
    deleted_at: Date | null;
    created_at: Date;
    updated_at: Date;
}

/**
 * Symbol dependency
 * Represents a dependency of a symbol on other symbols/modules
 */
export interface SymbolDependency {
    id: string;  // Internal UUID
    symbol_id: string;  // FK to symbols.id
    dependency_module: string;  // Module path
    dependency_symbols_json: string | null;  // JSON array of dependent symbol names
    is_type_only: boolean;
    is_reexport: boolean;
}

