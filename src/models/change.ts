/**
 * T-Dimension: Change model
 * Represents change reports from docs/system/CHANGE_REPORT.md
 */
export interface ChangeReport {
    id: string;  // Internal UUID
    plugin_id: string;
    run_type: 'full' | 'incremental';
    parsed_files: number;
    skipped_files: number;
    total_dependencies: number;
    validation_errors: number;
    validation_warnings: number;
    created_at: Date;
}

/**
 * Symbol change
 * Represents a change to a symbol
 */
export interface SymbolChange {
    id: string;  // Internal UUID
    report_id: string;  // FK to change_reports.id
    change_type: 'added' | 'removed' | 'changed';
    file_path: string;  // Repository-relative source path
    symbol_name: string;
    symbol_kind: string;
    old_signature: string | null;
    new_signature: string | null;
}

/**
 * Dependency change
 * Represents a change to a dependency
 */
export interface DependencyChange {
    id: string;  // Internal UUID
    report_id: string;  // FK to change_reports.id
    change_type: 'added' | 'removed';
    from_module: string;  // Repository-relative source path
    to_module: string;  // Repository-relative source path
    dependency_type: string;
}

