/**
 * X-Dimension: Module model
 * Represents a module from docs/modules/*.md
 */
export interface Module {
    id: string;  // Internal UUID
    plugin_id: string;
    file_path: string;  // Repository-relative source path (e.g., src/core/scanner.ts)
    content_hash: string;  // SHA256 of content_markdown
    content_markdown: string;  // Full markdown content
    line_count: number | null;  // Total lines in source file
    byte_size: number | null;  // Total bytes in source file
    deleted_at: Date | null;
    created_at: Date;
    updated_at: Date;
}

/**
 * Module symbol association
 * Links modules to their symbols
 */
export interface ModuleSymbol {
    id: string;  // Internal UUID
    module_id: string;  // FK to modules.id
    symbol_external_id: string;  // External symbol ID (for cross-dimension reference)
    symbol_name: string;
    symbol_kind: string;
}

