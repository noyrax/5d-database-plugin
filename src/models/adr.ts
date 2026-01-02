/**
 * W-Dimension: ADR model
 * Represents an Architecture Decision Record from docs/adr/*.md
 */
export interface Adr {
    id: string;  // Internal UUID
    plugin_id: string;
    adr_number: string;  // External ID (e.g., "020" from "020-api-doc-tiefe.md")
    title: string;
    file_name: string;  // ADR file name
    content_markdown: string;  // Full markdown content
    content_hash: string;  // SHA256 of content_markdown
    deleted_at: Date | null;
    created_at: Date;
    updated_at: Date;
}

/**
 * ADR file mapping
 * Links ADRs to source files they reference
 */
export interface AdrFileMapping {
    id: string;  // Internal UUID
    adr_id: string;  // FK to adrs.id
    file_path: string;  // Repository-relative source path
}

