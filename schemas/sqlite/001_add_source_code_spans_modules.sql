-- Migration 001: Add source code span tracking to modules table (X-Dimension)
-- Adds file size metadata to modules table

-- Add file size metadata to modules table
ALTER TABLE modules ADD COLUMN line_count INTEGER;
ALTER TABLE modules ADD COLUMN byte_size INTEGER;

