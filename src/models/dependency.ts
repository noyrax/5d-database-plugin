/**
 * Z-Dimension: Dependency model
 * Represents a module dependency from docs/system/DEPENDENCY_GRAPH.md
 */
export interface Dependency {
    id: string;  // Internal UUID
    plugin_id: string;
    from_module: string;  // Repository-relative source path
    to_module: string;  // Repository-relative source path
    dependency_type: 'import' | 'export' | 'require';
    symbols_json: string | null;  // JSON array of symbol names
    content_hash: string;  // Hash for change detection
    is_type_only: boolean;
    is_reexport: boolean;
    created_at: Date;
    updated_at: Date;
}

/**
 * Dependency graph cache
 * Stores the parsed Mermaid graph
 */
export interface DependencyGraphCache {
    id: string;  // Internal UUID
    plugin_id: string;
    mermaid_graph: string;  // Full Mermaid graph text
    generated_at: Date;
}

/**
 * Dependency symbol evidence
 * Links Z-Dimension dependencies to Y-Dimension symbol dependencies
 */
export interface DependencySymbolEvidence {
    id: string;  // Internal UUID
    dependency_id: string;  // FK to dependencies.id (Z-Dimension)
    symbol_dependency_id: string;  // FK to symbol_dependencies.id (Y-Dimension)
}

