-- Ingestion Management Schema
-- This schema is used across all dimensions for tracking ingestion runs

-- Note: This table should be created in a separate ingestion.db or in one of the dimension databases
-- For simplicity, we'll create it in each dimension database, but only use it from one
-- Alternatively, it could be in a separate ingestion.db file

CREATE TABLE IF NOT EXISTS ingestion_runs (
    id TEXT PRIMARY KEY,
    plugin_id TEXT NOT NULL,
    run_type TEXT NOT NULL CHECK (run_type IN ('full', 'incremental')),
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
    dimensions_processed TEXT NOT NULL,
    error_message TEXT
);

CREATE TABLE IF NOT EXISTS entity_renames (
    id TEXT PRIMARY KEY,
    dimension TEXT NOT NULL CHECK (dimension IN ('X', 'Y', 'Z', 'W')),
    old_external_id TEXT NOT NULL,
    new_external_id TEXT NOT NULL,
    plugin_id TEXT NOT NULL,
    detected_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ingestion_runs_plugin_id ON ingestion_runs(plugin_id);
CREATE INDEX IF NOT EXISTS idx_ingestion_runs_status ON ingestion_runs(status);
CREATE INDEX IF NOT EXISTS idx_ingestion_runs_started_at ON ingestion_runs(started_at);
CREATE INDEX IF NOT EXISTS idx_entity_renames_dimension ON entity_renames(dimension);
CREATE INDEX IF NOT EXISTS idx_entity_renames_plugin_id ON entity_renames(plugin_id);

