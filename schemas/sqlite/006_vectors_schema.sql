-- V-Dimension: Vectors Database Schema
-- Stores embeddings, importance scores, and navigation metadata

-- Embeddings pro Entity (aus 5D-DBs)
CREATE TABLE IF NOT EXISTS embeddings (
    id TEXT PRIMARY KEY,
    plugin_id TEXT NOT NULL,
    dimension TEXT NOT NULL CHECK (dimension IN ('X', 'Y', 'Z', 'W', 'T')),
    entity_id TEXT NOT NULL,  -- Internal ID aus entsprechender Dimension
    external_id TEXT NOT NULL,  -- External ID (file_path, symbol_id, etc.)
    content_hash TEXT NOT NULL,  -- Hash des Original-Contents
    embedding_model TEXT NOT NULL,  -- z.B. 'text-embedding-3-small'
    embedding_vector BLOB NOT NULL,  -- VSS vector (1536 floats as binary)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(plugin_id, dimension, entity_id, embedding_model)
);

-- Importance Scores pro Entity
CREATE TABLE IF NOT EXISTS importance_scores (
    id TEXT PRIMARY KEY,
    plugin_id TEXT NOT NULL,
    dimension TEXT NOT NULL CHECK (dimension IN ('X', 'Y', 'Z', 'W', 'T')),
    entity_id TEXT NOT NULL,
    pagerank_score REAL NOT NULL,
    betweenness_score REAL NOT NULL,
    combined_score REAL NOT NULL,  -- Gewichtete Kombination
    rank INTEGER NOT NULL,  -- Ranking (1 = wichtigste)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(plugin_id, dimension, entity_id)
);

-- Navigation Metadata
CREATE TABLE IF NOT EXISTS navigation_metadata (
    id TEXT PRIMARY KEY,
    plugin_id TEXT NOT NULL,
    dimension TEXT NOT NULL CHECK (dimension IN ('X', 'Y', 'Z', 'W', 'T')),
    entity_id TEXT NOT NULL,
    is_entry_point BOOLEAN DEFAULT FALSE,
    cluster_id TEXT,  -- Gruppierung verwandter Entities
    related_adrs TEXT,  -- JSON Array von ADR-Nummern
    importance_rank INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(plugin_id, dimension, entity_id)
);

-- Entry Points (manuelle Overrides)
CREATE TABLE IF NOT EXISTS entry_points (
    id TEXT PRIMARY KEY,
    plugin_id TEXT NOT NULL,
    dimension TEXT NOT NULL CHECK (dimension IN ('X', 'Y', 'Z', 'W', 'T')),
    entity_id TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 0,  -- Höher = wichtiger
    reason TEXT,  -- Warum ist dies ein Entry Point?
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(plugin_id, dimension, entity_id)
);

-- VSS Index (wird von SQLite VSS verwaltet)
-- Note: VSS virtual table creation is done programmatically after VSS extension is loaded
-- CREATE VIRTUAL TABLE embeddings_vss USING vss0(embedding_vector(1536));

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_embeddings_plugin_dimension ON embeddings(plugin_id, dimension);
CREATE INDEX IF NOT EXISTS idx_embeddings_entity_id ON embeddings(entity_id);
CREATE INDEX IF NOT EXISTS idx_embeddings_content_hash ON embeddings(content_hash);
CREATE INDEX IF NOT EXISTS idx_importance_scores_plugin_dimension ON importance_scores(plugin_id, dimension);
CREATE INDEX IF NOT EXISTS idx_importance_scores_rank ON importance_scores(rank);
CREATE INDEX IF NOT EXISTS idx_navigation_metadata_plugin_dimension ON navigation_metadata(plugin_id, dimension);
CREATE INDEX IF NOT EXISTS idx_navigation_metadata_entry_point ON navigation_metadata(is_entry_point);
CREATE INDEX IF NOT EXISTS idx_entry_points_plugin_dimension ON entry_points(plugin_id, dimension);


