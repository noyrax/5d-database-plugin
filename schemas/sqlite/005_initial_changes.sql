-- T-Dimension: Changes Database Schema
-- Stores change reports from docs/system/CHANGE_REPORT.md

CREATE TABLE IF NOT EXISTS change_reports (
    id TEXT PRIMARY KEY,
    plugin_id TEXT NOT NULL,
    run_type TEXT NOT NULL CHECK (run_type IN ('full', 'incremental')),
    parsed_files INTEGER NOT NULL,
    skipped_files INTEGER NOT NULL,
    total_dependencies INTEGER NOT NULL,
    validation_errors INTEGER NOT NULL,
    validation_warnings INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(plugin_id, created_at)
);

CREATE TABLE IF NOT EXISTS symbol_changes (
    id TEXT PRIMARY KEY,
    report_id TEXT NOT NULL,
    change_type TEXT NOT NULL CHECK (change_type IN ('added', 'removed', 'changed')),
    file_path TEXT NOT NULL,
    symbol_name TEXT NOT NULL,
    symbol_kind TEXT NOT NULL,
    old_signature TEXT,
    new_signature TEXT,
    FOREIGN KEY (report_id) REFERENCES change_reports(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS dependency_changes (
    id TEXT PRIMARY KEY,
    report_id TEXT NOT NULL,
    change_type TEXT NOT NULL CHECK (change_type IN ('added', 'removed')),
    from_module TEXT NOT NULL,
    to_module TEXT NOT NULL,
    dependency_type TEXT NOT NULL,
    FOREIGN KEY (report_id) REFERENCES change_reports(id) ON DELETE CASCADE
);

-- ID Mapping for external IDs
CREATE TABLE IF NOT EXISTS change_id_mapping (
    internal_id TEXT PRIMARY KEY,
    external_id TEXT NOT NULL UNIQUE,
    plugin_id TEXT NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_change_reports_plugin_id ON change_reports(plugin_id);
CREATE INDEX IF NOT EXISTS idx_change_reports_created_at ON change_reports(created_at);
CREATE INDEX IF NOT EXISTS idx_symbol_changes_report_id ON symbol_changes(report_id);
CREATE INDEX IF NOT EXISTS idx_symbol_changes_file_path ON symbol_changes(file_path);
CREATE INDEX IF NOT EXISTS idx_dependency_changes_report_id ON dependency_changes(report_id);
CREATE INDEX IF NOT EXISTS idx_change_id_mapping_external_id ON change_id_mapping(external_id);
CREATE INDEX IF NOT EXISTS idx_change_id_mapping_plugin_id ON change_id_mapping(plugin_id);

