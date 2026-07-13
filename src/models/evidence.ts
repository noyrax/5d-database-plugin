/**
 * Evidence grading system for system-wide governance.
 * Ensures all claims have structured sources and explicit grading.
 */

/**
 * Evidence grade levels.
 */
export type EvidenceGrade = 'FACT' | 'INFERRED' | 'HEURISTIC' | 'CLAIMED';

/**
 * Evidence source types.
 */
export type EvidenceSourceType = 
    | 'ADR' 
    | 'MODULE' 
    | 'SYMBOL' 
    | 'DEPENDENCY' 
    | 'DB_QUERY' 
    | 'STATUS_CHECK' 
    | 'CONTRACT'
    | 'CODE_SNIPPET'
    | 'FILESYSTEM_READ'
    | 'HEURISTIC';

/**
 * Structured evidence source.
 * Normalform for all evidence sources.
 */
export interface EvidenceSource {
    /** Type of source */
    type: EvidenceSourceType;
    
    /** Identifier (e.g., ADR number, symbol ID) */
    id?: string;
    
    /** File path (if applicable) */
    path?: string;
    
    /** Content hash (if applicable) */
    hash?: string;
    
    /** Tool that generated this source (e.g., 'query_modules', 'verifyAdrs', 'boundary_report') */
    tool?: string;
    
    /** Target entity (e.g., file path, symbol ID, ADR number) */
    target?: string;
    
    /** Query ID (for tracking specific queries) */
    queryId?: string;
    
    /** Additional metadata */
    metadata?: Record<string, any>;
}

/**
 * Evidence information attached to responses.
 */
export interface Evidence {
    /** Grade of the evidence */
    grade: EvidenceGrade;
    
    /** Structured sources */
    sources: EvidenceSource[];
    
    /** Optional description */
    description?: string;
}

/**
 * Helper function to create an evidence source.
 */
export function createEvidenceSource(
    type: EvidenceSourceType,
    id?: string,
    path?: string,
    hash?: string,
    metadata?: Record<string, any>,
    tool?: string,
    target?: string,
    queryId?: string
): EvidenceSource {
    return {
        type,
        id,
        path,
        hash,
        tool,
        target,
        queryId,
        metadata
    };
}

/**
 * Helper function to create evidence.
 */
export function createEvidence(
    grade: EvidenceGrade,
    sources: EvidenceSource[],
    description?: string
): Evidence {
    return {
        grade,
        sources,
        description
    };
}

/**
 * Helper function to create FACT evidence.
 */
export function createFactEvidence(
    sources: EvidenceSource[],
    description?: string
): Evidence {
    return createEvidence('FACT', sources, description);
}

/**
 * Helper function to create INFERRED evidence.
 */
export function createInferredEvidence(
    sources: EvidenceSource[],
    description?: string
): Evidence {
    return createEvidence('INFERRED', sources, description);
}

/**
 * Helper function to create HEURISTIC evidence.
 */
export function createHeuristicEvidence(
    sources: EvidenceSource[],
    description?: string
): Evidence {
    return createEvidence('HEURISTIC', sources, description);
}

/**
 * Helper function to create CLAIMED evidence.
 * Used for ADR/documentation claims that have not been verified yet.
 */
export function createClaimedEvidence(
    sources: EvidenceSource[],
    description?: string
): Evidence {
    return createEvidence('CLAIMED', sources, description);
}

/**
 * Validates that evidence has sources (for FACT and INFERRED).
 * HEURISTIC may have empty sources.
 */
export function validateEvidence(evidence: Evidence): { valid: boolean; error?: string } {
    if (!evidence || !evidence.grade) {
        return {
            valid: false,
            error: 'Evidence must have a grade'
        };
    }

    if (!evidence.sources) {
        return {
            valid: false,
            error: 'Evidence must have sources'
        };
    }

    if (evidence.grade === 'FACT' || evidence.grade === 'INFERRED' || evidence.grade === 'CLAIMED') {
        if (!Array.isArray(evidence.sources) || evidence.sources.length === 0) {
            return {
                valid: false,
                error: `${evidence.grade} evidence must have at least one source`
            };
        }
    }
    
    // Validate sources
    if (Array.isArray(evidence.sources)) {
        for (const source of evidence.sources) {
            if (!source.type) {
                return {
                    valid: false,
                    error: 'Evidence source must have a type'
                };
            }
        }
    }
    
    return { valid: true };
}

