-- Z-Dimension: Dependencies Database Schema
-- Stores module dependencies from docs/system/DEPENDENCY_GRAPH.md

CREATE TABLE IF NOT EXISTS dependencies (
    id TEXT PRIMARY KEY,
    plugin_id TEXT NOT NULL,
    from_module TEXT NOT NULL,
    to_module TEXT NOT NULL,
    dependency_type TEXT NOT NULL CHECK (dependency_type IN ('import', 'export', 'require')),
    symbols_json TEXT,
    content_hash TEXT NOT NULL,
    is_type_only BOOLEAN DEFAULT FALSE,
    is_reexport BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(plugin_id, from_module, to_module, dependency_type)
);

CREATE TABLE IF NOT EXISTS dependency_graph_cache (
    id TEXT PRIMARY KEY,
    plugin_id TEXT NOT NULL,
    mermaid_graph TEXT NOT NULL,
    generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(plugin_id)
);

-- Traceability: Links Z-Dimension dependencies to Y-Dimension symbol dependencies
CREATE TABLE IF NOT EXISTS dependency_symbol_evidence (
    id TEXT PRIMARY KEY,
    dependency_id TEXT NOT NULL,
    symbol_dependency_id TEXT NOT NULL,
    FOREIGN KEY (dependency_id) REFERENCES dependencies(id) ON DELETE CASCADE
);

-- ID Mapping for external IDs
CREATE TABLE IF NOT EXISTS dependency_id_mapping (
    internal_id TEXT PRIMARY KEY,
    external_id TEXT NOT NULL UNIQUE,
    plugin_id TEXT NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_dependencies_plugin_id ON dependencies(plugin_id);
CREATE INDEX IF NOT EXISTS idx_dependencies_from_module ON dependencies(from_module);
CREATE INDEX IF NOT EXISTS idx_dependencies_to_module ON dependencies(to_module);
CREATE INDEX IF NOT EXISTS idx_dependencies_content_hash ON dependencies(content_hash);
CREATE INDEX IF NOT EXISTS idx_dependency_symbol_evidence_dependency_id ON dependency_symbol_evidence(dependency_id);
CREATE INDEX IF NOT EXISTS idx_dependency_symbol_evidence_symbol_dep_id ON dependency_symbol_evidence(symbol_dependency_id);
CREATE INDEX IF NOT EXISTS idx_dependency_id_mapping_external_id ON dependency_id_mapping(external_id);
CREATE INDEX IF NOT EXISTS idx_dependency_id_mapping_plugin_id ON dependency_id_mapping(plugin_id);

