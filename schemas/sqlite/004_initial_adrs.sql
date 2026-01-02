-- W-Dimension: ADRs Database Schema
-- Stores Architecture Decision Records from docs/adr/*.md

CREATE TABLE IF NOT EXISTS adrs (
    id TEXT PRIMARY KEY,
    plugin_id TEXT NOT NULL,
    adr_number TEXT NOT NULL,
    title TEXT NOT NULL,
    file_name TEXT NOT NULL,
    content_markdown TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    deleted_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(plugin_id, adr_number)
);

CREATE TABLE IF NOT EXISTS adr_file_mappings (
    id TEXT PRIMARY KEY,
    adr_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    FOREIGN KEY (adr_id) REFERENCES adrs(id) ON DELETE CASCADE,
    UNIQUE(adr_id, file_path)
);

-- ID Mapping for external IDs
CREATE TABLE IF NOT EXISTS adr_id_mapping (
    internal_id TEXT PRIMARY KEY,
    external_id TEXT NOT NULL UNIQUE,
    plugin_id TEXT NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_adrs_plugin_id ON adrs(plugin_id);
CREATE INDEX IF NOT EXISTS idx_adrs_adr_number ON adrs(adr_number);
CREATE INDEX IF NOT EXISTS idx_adrs_content_hash ON adrs(content_hash);
CREATE INDEX IF NOT EXISTS idx_adr_file_mappings_adr_id ON adr_file_mappings(adr_id);
CREATE INDEX IF NOT EXISTS idx_adr_file_mappings_file_path ON adr_file_mappings(file_path);
CREATE INDEX IF NOT EXISTS idx_adr_id_mapping_external_id ON adr_id_mapping(external_id);
CREATE INDEX IF NOT EXISTS idx_adr_id_mapping_plugin_id ON adr_id_mapping(plugin_id);

