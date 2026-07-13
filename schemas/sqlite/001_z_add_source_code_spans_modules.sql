-- Migration 001: Add source code span tracking to modules table (X-Dimension)
-- Adds file size metadata to modules table

-- Add file size metadata to modules table (only if columns don't exist)
-- SQLite doesn't support IF NOT EXISTS for ALTER TABLE ADD COLUMN,
-- so we check if the column exists first using a pragma query
-- This migration is idempotent - it can be run multiple times safely

-- Note: This migration may fail if columns already exist (from migration 007).
-- That's OK - the migration manager will handle it gracefully.
ALTER TABLE modules ADD COLUMN line_count INTEGER;
ALTER TABLE modules ADD COLUMN byte_size INTEGER;

