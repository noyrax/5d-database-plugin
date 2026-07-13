import { Evidence, EvidenceSource, EvidenceGrade, createFactEvidence, createInferredEvidence, createHeuristicEvidence, validateEvidence } from '../models/evidence';

/**
 * Evidence grader for determining evidence grades and managing sources.
 * Implements the No-Claim-Without-Source rule.
 */
export class EvidenceGrader {
    /**
     * Grades evidence as FACT.
     * FACT: directly derivable from DB/ADR/Code-Symbol/Toolcall (with structured sources).
     * 
     * @param sources Structured sources
     * @param description Optional description
     * @returns FACT evidence
     */
    gradeAsFact(sources: EvidenceSource[], description?: string): Evidence {
        const evidence = createFactEvidence(sources, description);
        const validation = validateEvidence(evidence);
        if (!validation.valid) {
            throw new Error(`Invalid FACT evidence: ${validation.error}`);
        }
        return evidence;
    }

    /**
     * Grades evidence as INFERRED.
     * INFERRED: derived from multiple facts (all sources must be listed as structured sources).
     * 
     * @param sources Structured sources (all facts used for inference)
     * @param description Optional description
     * @returns INFERRED evidence
     */
    gradeAsInferred(sources: EvidenceSource[], description?: string): Evidence {
        const evidence = createInferredEvidence(sources, description);
        const validation = validateEvidence(evidence);
        if (!validation.valid) {
            throw new Error(`Invalid INFERRED evidence: ${validation.error}`);
        }
        return evidence;
    }

    /**
     * Grades evidence as HEURISTIC.
     * HEURISTIC: best-practice without system evidence (must be explicitly marked).
     * 
     * @param sources Optional structured sources (may be empty for pure heuristics)
     * @param description Description of the heuristic
     * @returns HEURISTIC evidence
     */
    gradeAsHeuristic(sources: EvidenceSource[] = [], description?: string): Evidence {
        return createHeuristicEvidence(sources, description);
    }

    /**
     * Automatically grades evidence based on source count and type.
     * 
     * Rules:
     * - Single direct source (DB_QUERY, STATUS_CHECK, ADR, MODULE, SYMBOL) → FACT
     * - Multiple sources → INFERRED
     * - No sources → HEURISTIC (with warning)
     * 
     * @param sources Structured sources
     * @param description Optional description
     * @returns Graded evidence
     */
    autoGrade(sources: EvidenceSource[], description?: string): Evidence {
        if (sources.length === 0) {
            return this.gradeAsHeuristic([], description || 'No sources provided - marked as HEURISTIC');
        }

        if (sources.length === 1) {
            const source = sources[0];
            // Direct sources are FACT
            if (['DB_QUERY', 'STATUS_CHECK', 'ADR', 'MODULE', 'SYMBOL'].includes(source.type)) {
                return this.gradeAsFact(sources, description);
            }
        }

        // Multiple sources → INFERRED
        return this.gradeAsInferred(sources, description);
    }

    /**
     * Validates evidence and throws if invalid.
     * 
     * @param evidence Evidence to validate
     * @throws Error if evidence is invalid
     */
    validate(evidence: Evidence): void {
        const validation = validateEvidence(evidence);
        if (!validation.valid) {
            throw new Error(`Invalid evidence: ${validation.error}`);
        }
    }

    /**
     * Checks if text claims "from documentation" without sources.
     * This violates the No-Claim-Without-Source rule.
     * 
     * @param text Text to check
     * @param evidence Evidence attached to the text
     * @returns true if violation detected
     */
    checkNoClaimWithoutSource(text: string, evidence?: Evidence): boolean {
        // Check for common phrases that claim documentation without sources
        const claimPhrases = [
            'in den Dokumenten gefunden',
            'aus der Dokumentation',
            'in der Doku',
            'found in documentation',
            'from documentation',
            'in the docs'
        ];

        const hasClaim = claimPhrases.some(phrase => 
            text.toLowerCase().includes(phrase.toLowerCase())
        );

        if (hasClaim) {
            // If text claims documentation but no evidence or no sources
            if (!evidence || evidence.sources.length === 0) {
                return true; // Violation
            }
        }

        return false; // No violation
    }

    /**
     * Ensures HEURISTIC evidence is explicitly marked.
     * 
     * @param evidence Evidence to check
     * @returns true if HEURISTIC is properly marked
     */
    isHeuristicMarked(evidence: Evidence): boolean {
        if (evidence.grade === 'HEURISTIC') {
            // HEURISTIC should have description or be explicitly marked
            return !!(evidence.description || evidence.sources.length === 0);
        }
        return true; // Not HEURISTIC, so marking is not required
    }

    /**
     * Grade code analysis evidence.
     * DETERMINISTIC only when source code was retrieved and verified.
     * 
     * @param args Analysis arguments
     * @returns Graded evidence
     */
    gradeCodeAnalysis(args: {
        source_snippet_retrieved: boolean;
        source_hash_verified: boolean;
        analysis: string;
    }): Evidence {
        if (!args.source_snippet_retrieved) {
            // Code not retrieved - INFERRED
            return this.gradeAsInferred([
                { type: 'SYMBOL' }, // Signature analysis
                { type: 'DEPENDENCY' } // Dependency graph analysis
            ], args.analysis + '\n\n⚠️ WARNING: Analysis based on signatures only. ' +
                          'Source code not retrieved. Confidence: LOW.');
        }

        if (args.source_snippet_retrieved && !args.source_hash_verified) {
            // Code retrieved but not verified - INFERRED
            return this.gradeAsInferred([
                { type: 'STATUS_CHECK', metadata: { check: 'source_code_unverified' } }
            ], args.analysis + '\n\n⚠️ WARNING: Source code retrieved but hash not verified. ' +
                          'Code may have changed since scan. Confidence: MEDIUM.');
        }

        // Code retrieved and verified - FACT (DETERMINISTIC)
        return this.gradeAsFact([
            { type: 'STATUS_CHECK', metadata: { check: 'source_code_verified' } }
        ], args.analysis + '\n\n✅ Analysis based on verified source code. Confidence: HIGH.');
    }
}

