-- X-Dimension: Modules Database Schema
-- Stores module documentation from docs/modules/*.md

CREATE TABLE IF NOT EXISTS modules (
    id TEXT PRIMARY KEY,
    plugin_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    content_markdown TEXT NOT NULL,
    deleted_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(plugin_id, file_path)
);

CREATE TABLE IF NOT EXISTS module_symbols (
    id TEXT PRIMARY KEY,
    module_id TEXT NOT NULL,
    symbol_external_id TEXT NOT NULL,
    symbol_name TEXT NOT NULL,
    symbol_kind TEXT NOT NULL,
    FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE
);

-- ID Mapping for external IDs
CREATE TABLE IF NOT EXISTS module_id_mapping (
    internal_id TEXT PRIMARY KEY,
    external_id TEXT NOT NULL UNIQUE,
    plugin_id TEXT NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_modules_plugin_id ON modules(plugin_id);
CREATE INDEX IF NOT EXISTS idx_modules_file_path ON modules(file_path);
CREATE INDEX IF NOT EXISTS idx_modules_content_hash ON modules(content_hash);
CREATE INDEX IF NOT EXISTS idx_module_symbols_module_id ON module_symbols(module_id);
CREATE INDEX IF NOT EXISTS idx_module_id_mapping_external_id ON module_id_mapping(external_id);
CREATE INDEX IF NOT EXISTS idx_module_id_mapping_plugin_id ON module_id_mapping(plugin_id);

