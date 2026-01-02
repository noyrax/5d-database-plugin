-- Y-Dimension: Symbols Database Schema
-- Stores symbols from docs/index/symbols.jsonl

CREATE TABLE IF NOT EXISTS symbols (
    id TEXT PRIMARY KEY,
    plugin_id TEXT NOT NULL,
    symbol_id TEXT NOT NULL,
    path TEXT NOT NULL,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    signature_json TEXT NOT NULL,
    signature_hash TEXT NOT NULL,
    summary TEXT,
    deleted_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(plugin_id, symbol_id)
);

CREATE TABLE IF NOT EXISTS symbol_dependencies (
    id TEXT PRIMARY KEY,
    symbol_id TEXT NOT NULL,
    dependency_module TEXT NOT NULL,
    dependency_symbols_json TEXT,
    is_type_only BOOLEAN DEFAULT FALSE,
    is_reexport BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (symbol_id) REFERENCES symbols(id) ON DELETE CASCADE
);

-- ID Mapping for external IDs
CREATE TABLE IF NOT EXISTS symbol_id_mapping (
    internal_id TEXT PRIMARY KEY,
    external_id TEXT NOT NULL UNIQUE,
    plugin_id TEXT NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_symbols_plugin_id ON symbols(plugin_id);
CREATE INDEX IF NOT EXISTS idx_symbols_symbol_id ON symbols(symbol_id);
CREATE INDEX IF NOT EXISTS idx_symbols_path ON symbols(path);
CREATE INDEX IF NOT EXISTS idx_symbols_signature_hash ON symbols(signature_hash);
CREATE INDEX IF NOT EXISTS idx_symbol_dependencies_symbol_id ON symbol_dependencies(symbol_id);
CREATE INDEX IF NOT EXISTS idx_symbol_dependencies_module ON symbol_dependencies(dependency_module);
CREATE INDEX IF NOT EXISTS idx_symbol_id_mapping_external_id ON symbol_id_mapping(external_id);
CREATE INDEX IF NOT EXISTS idx_symbol_id_mapping_plugin_id ON symbol_id_mapping(plugin_id);

