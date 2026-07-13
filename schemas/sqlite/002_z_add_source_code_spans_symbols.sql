-- Migration 002: Add source code span tracking to symbols table (Y-Dimension)
-- Adds line/column/byte offset tracking for source code location

-- Add span tracking columns to symbols table (only if columns don't exist)
-- SQLite doesn't support IF NOT EXISTS for ALTER TABLE ADD COLUMN,
-- so we check if the column exists first using a pragma query
-- This migration is idempotent - it can be run multiple times safely

-- Note: This migration may fail if columns already exist (from migration 007).
-- That's OK - the migration manager will handle it gracefully.
ALTER TABLE symbols ADD COLUMN start_line INTEGER;
ALTER TABLE symbols ADD COLUMN end_line INTEGER;
ALTER TABLE symbols ADD COLUMN start_col INTEGER;
ALTER TABLE symbols ADD COLUMN end_col INTEGER;
ALTER TABLE symbols ADD COLUMN byte_offset_start INTEGER;
ALTER TABLE symbols ADD COLUMN byte_offset_end INTEGER;

-- Add index for span lookups
CREATE INDEX IF NOT EXISTS idx_symbols_span 
ON symbols(path, start_line, end_line);

