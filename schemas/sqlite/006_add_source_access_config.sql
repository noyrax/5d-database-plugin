-- Migration 006: Add source access config table to V-Dimension
-- Stores runtime contract for source code access (AVAILABLE/UNAVAILABLE/PARTIAL)

CREATE TABLE IF NOT EXISTS source_access_config (
    id TEXT PRIMARY KEY DEFAULT 'singleton',
    status TEXT NOT NULL CHECK(status IN ('AVAILABLE', 'UNAVAILABLE', 'PARTIAL')),
    resolver_type TEXT CHECK(resolver_type IN ('FILESYSTEM', 'GIT', 'REMOTE', 'SNAPSHOT')),
    workspace_root TEXT,
    
    -- Constraints
    max_bytes_per_request INTEGER DEFAULT 51200,      -- 50KB
    max_lines_per_request INTEGER DEFAULT 500,
    max_concurrent_requests INTEGER DEFAULT 5,
    redactions_json TEXT,  -- JSON array of patterns
    
    -- Reason codes (when UNAVAILABLE/PARTIAL)
    reason_codes_json TEXT,  -- JSON array of codes
    
    -- Provenance
    verified_at TEXT NOT NULL,  -- ISO timestamp
    evidence_grade TEXT NOT NULL CHECK(evidence_grade IN ('DETERMINISTIC', 'INFERRED')),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure only one row exists
    CHECK(id = 'singleton')
);

-- Initialize with default UNAVAILABLE state
INSERT OR IGNORE INTO source_access_config (id, status, verified_at, evidence_grade)
VALUES ('singleton', 'UNAVAILABLE', datetime('now'), 'DETERMINISTIC');

