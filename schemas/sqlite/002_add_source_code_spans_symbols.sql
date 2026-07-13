-- Migration 002: Add source code span tracking to symbols table (Y-Dimension)
-- Adds line/column/byte offset tracking for source code location

-- Add span tracking columns to symbols table
ALTER TABLE symbols ADD COLUMN start_line INTEGER;
ALTER TABLE symbols ADD COLUMN end_line INTEGER;
ALTER TABLE symbols ADD COLUMN start_col INTEGER;
ALTER TABLE symbols ADD COLUMN end_col INTEGER;
ALTER TABLE symbols ADD COLUMN byte_offset_start INTEGER;
ALTER TABLE symbols ADD COLUMN byte_offset_end INTEGER;

-- Add index for span lookups
CREATE INDEX IF NOT EXISTS idx_symbols_span 
ON symbols(path, start_line, end_line);

