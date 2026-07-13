import { EvidenceGrader } from '../src/api/evidence-grader';
import { EvidenceSource, EvidenceSourceType, EvidenceGrade } from '../src/models/evidence';

describe('Evidence Governance', () => {
    let grader: EvidenceGrader;

    beforeEach(() => {
        grader = new EvidenceGrader();
    });

    describe('FACT evidence', () => {
        test('should create FACT evidence with sources', () => {
            const sources: EvidenceSource[] = [
                {
                    type: 'ADR',
                    id: 'ADR-048',
                    path: 'docs/adr/048-integration-contract-versioning.md'
                }
            ];

            const evidence = grader.gradeAsFact(sources, 'Test description');

            expect(evidence.grade).toBe('FACT');
            expect(evidence.sources).toHaveLength(1);
            expect(evidence.sources[0].type).toBe('ADR');
            expect(evidence.sources[0].id).toBe('ADR-048');
        });

        test('should throw error if FACT evidence has no sources', () => {
            expect(() => {
                grader.gradeAsFact([], 'Test description');
            }).toThrow('Invalid FACT evidence');
        });

        test('should validate FACT evidence', () => {
            const sources: EvidenceSource[] = [
                {
                    type: 'MODULE',
                    id: 'module-id-123',
                    path: 'src/module.ts'
                }
            ];

            const evidence = grader.gradeAsFact(sources);
            grader.validate(evidence);

            // Should not throw
            expect(evidence.grade).toBe('FACT');
        });

        test('should accept FACT source with only type (id/path/hash are optional)', () => {
            // Sources only need a type - id/path/hash are optional
            const sources: EvidenceSource[] = [
                {
                    type: 'ADR'
                    // Missing id, path, hash - but type is sufficient
                }
            ];

            const evidence = grader.gradeAsFact(sources, 'Test description');
            expect(evidence.grade).toBe('FACT');
            expect(evidence.sources[0].type).toBe('ADR');
        });
    });

    describe('INFERRED evidence', () => {
        test('should create INFERRED evidence with multiple sources', () => {
            const sources: EvidenceSource[] = [
                {
                    type: 'DB_QUERY',
                    id: 'query-1',
                    path: 'query_modules'
                },
                {
                    type: 'ADR',
                    id: 'ADR-048'
                }
            ];

            const evidence = grader.gradeAsInferred(sources, 'Inferred from multiple sources');

            expect(evidence.grade).toBe('INFERRED');
            expect(evidence.sources).toHaveLength(2);
        });

        test('should throw error if INFERRED evidence has no sources', () => {
            expect(() => {
                grader.gradeAsInferred([], 'Test description');
            }).toThrow('Invalid INFERRED evidence');
        });

        test('should validate INFERRED evidence', () => {
            const sources: EvidenceSource[] = [
                {
                    type: 'MODULE',
                    id: 'module-1'
                },
                {
                    type: 'SYMBOL',
                    id: 'symbol-1'
                }
            ];

            const evidence = grader.gradeAsInferred(sources);
            grader.validate(evidence);

            // Should not throw
            expect(evidence.grade).toBe('INFERRED');
        });
    });

    describe('HEURISTIC evidence', () => {
        test('should create HEURISTIC evidence without sources', () => {
            const evidence = grader.gradeAsHeuristic([], 'Best practice without system evidence');

            expect(evidence.grade).toBe('HEURISTIC');
            expect(evidence.sources).toHaveLength(0);
            expect(evidence.description).toBe('Best practice without system evidence');
        });

        test('should create HEURISTIC evidence with optional sources', () => {
            const sources: EvidenceSource[] = [
                {
                    type: 'DB_QUERY',
                    path: 'tool-output'
                }
            ];

            const evidence = grader.gradeAsHeuristic(sources, 'Heuristic with optional sources');

            expect(evidence.grade).toBe('HEURISTIC');
            expect(evidence.sources).toHaveLength(1);
        });

        test('should mark HEURISTIC as properly marked if description exists', () => {
            const evidence = grader.gradeAsHeuristic([], 'Explicit heuristic description');

            expect(grader.isHeuristicMarked(evidence)).toBe(true);
        });

        test('should mark HEURISTIC as properly marked if no sources', () => {
            const evidence = grader.gradeAsHeuristic([]);

            expect(grader.isHeuristicMarked(evidence)).toBe(true);
        });

        test('should validate HEURISTIC evidence', () => {
            const evidence = grader.gradeAsHeuristic([], 'Heuristic without sources');
            grader.validate(evidence);

            // Should not throw
            expect(evidence.grade).toBe('HEURISTIC');
        });
    });

    describe('autoGrade', () => {
        test('should grade as FACT for single direct source', () => {
            const sources: EvidenceSource[] = [
                {
                    type: 'DB_QUERY',
                    id: 'query-1',
                    path: 'query_modules'
                }
            ];

            const evidence = grader.autoGrade(sources, 'Single direct source');

            expect(evidence.grade).toBe('FACT');
        });

        test('should grade as FACT for ADR source', () => {
            const sources: EvidenceSource[] = [
                {
                    type: 'ADR',
                    id: 'ADR-048'
                }
            ];

            const evidence = grader.autoGrade(sources);

            expect(evidence.grade).toBe('FACT');
        });

        test('should grade as INFERRED for multiple sources', () => {
            const sources: EvidenceSource[] = [
                {
                    type: 'MODULE',
                    id: 'module-1'
                },
                {
                    type: 'SYMBOL',
                    id: 'symbol-1'
                }
            ];

            const evidence = grader.autoGrade(sources, 'Multiple sources');

            expect(evidence.grade).toBe('INFERRED');
        });

        test('should grade as HEURISTIC for no sources', () => {
            const evidence = grader.autoGrade([], 'No sources provided');

            expect(evidence.grade).toBe('HEURISTIC');
        });
    });

    describe('No-Claim-Without-Source Rule', () => {
        test('should detect violation when text claims documentation without sources', () => {
            const text = 'This was found in documentation';
            const hasViolation = grader.checkNoClaimWithoutSource(text);

            expect(hasViolation).toBe(true);
        });

        test('should detect violation when text claims "aus Doku" without sources', () => {
            const text = 'Dies wurde aus der Dokumentation entnommen';
            const hasViolation = grader.checkNoClaimWithoutSource(text);

            expect(hasViolation).toBe(true);
        });

        test('should not detect violation when text claims documentation with sources', () => {
            const text = 'This was found in documentation';
            const sources: EvidenceSource[] = [
                {
                    type: 'ADR',
                    id: 'ADR-048'
                }
            ];
            const evidence = grader.gradeAsFact(sources);

            const hasViolation = grader.checkNoClaimWithoutSource(text, evidence);

            expect(hasViolation).toBe(false);
        });

        test('should not detect violation when text does not claim documentation', () => {
            const text = 'This is a normal statement';
            const hasViolation = grader.checkNoClaimWithoutSource(text);

            expect(hasViolation).toBe(false);
        });

        test('should detect violation for various claim phrases', () => {
            const claimPhrases = [
                'in den Dokumenten gefunden',
                'aus der Dokumentation',
                'in der Doku',
                'found in documentation',
                'from documentation',
                'in the docs'
            ];

            for (const phrase of claimPhrases) {
                const hasViolation = grader.checkNoClaimWithoutSource(phrase);
                expect(hasViolation).toBe(true);
            }
        });
    });

    describe('Validation', () => {
        test('should validate valid FACT evidence', () => {
            const sources: EvidenceSource[] = [
                {
                    type: 'ADR',
                    id: 'ADR-048'
                }
            ];

            const evidence = grader.gradeAsFact(sources);
            grader.validate(evidence);

            // Should not throw
            expect(evidence.grade).toBe('FACT');
        });

        test('should throw error for invalid evidence without grade', () => {
            expect(() => {
                grader.validate({} as any);
            }).toThrow('Invalid evidence');
        });

        test('should throw error for invalid evidence without sources', () => {
            expect(() => {
                grader.validate({
                    grade: 'FACT',
                    sources: null
                } as any);
            }).toThrow('Invalid evidence');
        });

        test('should throw error for invalid evidence without sources', () => {
            expect(() => {
                grader.validate({
                    grade: 'FACT',
                    sources: null
                } as any);
            }).toThrow('Invalid evidence');
        });
    });

    describe('Evidence Source Types', () => {
        const validSourceTypes: EvidenceSourceType[] = [
            'ADR',
            'MODULE',
            'SYMBOL',
            'DEPENDENCY',
            'DB_QUERY',
            'STATUS_CHECK',
            'CONTRACT'
        ];

        test('should accept all valid source types', () => {
            for (const sourceType of validSourceTypes) {
                const sources: EvidenceSource[] = [
                    {
                        type: sourceType,
                        id: 'test-id'
                    }
                ];

                const evidence = grader.gradeAsFact(sources);
                expect(evidence.sources[0].type).toBe(sourceType);
            }
        });
    });
});

