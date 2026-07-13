/**
 * Query Rewriter Service
 * 
 * Provides centralized query rewriting logic for semantic search and discovery.
 * Handles ADR number recognition, query expansion, and synonym recognition.
 */

/**
 * Rewrites a query to improve semantic search results.
 * 
 * Features:
 * - ADR number recognition and expansion (e.g., "ADR-0016" → "ADR 0016" + "0016")
 * - Synonym recognition (e.g., "migration" → "migrate", "migrated", "migrating")
 * - Query expansion for better embedding matches
 */
export class QueryRewriter {
    /**
     * Rewrites a query to improve semantic search results.
     * 
     * @param query The original query string
     * @returns The rewritten query with expanded terms
     */
    public rewriteQuery(query: string): string {
        if (!query || query.trim().length === 0) {
            return query;
        }

        let rewritten = query;

        // 1. ADR number recognition and expansion
        const adrNumbers = this.extractAdrNumbers(query);
        if (adrNumbers.length > 0) {
            rewritten = this.expandAdrQuery(rewritten, adrNumbers);
        }

        // 2. Synonym recognition and expansion (optional, can be extended)
        rewritten = this.expandSynonyms(rewritten);

        return rewritten.trim();
    }

    /**
     * Extracts ADR numbers from a query string.
     * 
     * Recognizes patterns like:
     * - "ADR-0016"
     * - "ADR 0016"
     * - "0016"
     * - "16" (with context suggesting ADR)
     * 
     * @param query The query string
     * @returns Array of extracted ADR numbers (without leading zeros)
     */
    public extractAdrNumbers(query: string): string[] {
        const adrNumbers: string[] = [];
        
        // Pattern 1: "ADR-0016", "ADR-16", "adr-0016"
        const adrPrefixPattern = /ADR[- ]0*(\d+)/gi;
        let match;
        while ((match = adrPrefixPattern.exec(query)) !== null) {
            const number = match[1];
            if (!adrNumbers.includes(number)) {
                adrNumbers.push(number);
            }
        }

        // Pattern 2: Standalone numbers (3-4 digits) - likely ADR numbers
        // This is less reliable, so we only match if there's context (e.g., "ADR 0016" already found)
        const standalonePattern = /\b0*(\d{1,4})\b/g;
        while ((match = standalonePattern.exec(query)) !== null) {
            const number = match[1];
            // Only add if it looks like an ADR number (reasonable range: 1-9999)
            const numValue = parseInt(number, 10);
            if (numValue >= 1 && numValue <= 9999 && !adrNumbers.includes(number)) {
                // Check if there's context suggesting ADR (e.g., "ADR", "decision", "architecture")
                const context = query.toLowerCase();
                const hasAdrContext = 
                    context.includes('adr') ||
                    context.includes('decision') ||
                    context.includes('architecture') ||
                    context.includes('record');
                
                if (hasAdrContext || adrNumbers.length > 0) {
                    adrNumbers.push(number);
                }
            }
        }

        return adrNumbers;
    }

    /**
     * Expands a query with ADR number variants.
     * 
     * Adds variants like:
     * - "ADR 0016"
     * - "0016"
     * - "016" (with leading zero)
     * 
     * @param query The original query
     * @param adrNumbers Array of ADR numbers to expand
     * @returns Expanded query string
     */
    public expandAdrQuery(query: string, adrNumbers: string[]): string {
        if (adrNumbers.length === 0) {
            return query;
        }

        const expansions: string[] = [];

        for (const adrNumber of adrNumbers) {
            const numValue = parseInt(adrNumber, 10);
            
            // Add "ADR {number}"
            expansions.push(`ADR ${adrNumber}`);
            
            // Add padded version (e.g., "0016" if input was "16")
            const padded = numValue.toString().padStart(3, '0');
            if (padded !== adrNumber) {
                expansions.push(padded);
            }
            
            // Add unpadded version (e.g., "16" if input was "0016")
            const unpadded = numValue.toString();
            if (unpadded !== adrNumber && unpadded !== padded) {
                expansions.push(unpadded);
            }
        }

        // Combine original query with expansions
        const uniqueExpansions = Array.from(new Set(expansions));
        return `${query} ${uniqueExpansions.join(' ')}`;
    }

    /**
     * Expands synonyms in a query.
     * 
     * Currently handles common patterns:
     * - "migration" → "migrate", "migrated", "migrating"
     * - Can be extended with more synonym mappings
     * 
     * @param query The query string
     * @returns Query with expanded synonyms
     */
    private expandSynonyms(query: string): string {
        // Common synonym mappings
        const synonymMap: { [key: string]: string[] } = {
            'migration': ['migrate', 'migrated', 'migrating'],
            'migrate': ['migration', 'migrated', 'migrating'],
            'refactor': ['refactoring', 'refactored'],
            'refactoring': ['refactor', 'refactored'],
            'implement': ['implementation', 'implemented', 'implementing'],
            'implementation': ['implement', 'implemented', 'implementing'],
        };

        const words = query.split(/\s+/);
        const expandedWords: string[] = [];

        for (const word of words) {
            expandedWords.push(word);
            
            // Check for synonyms (case-insensitive)
            const lowerWord = word.toLowerCase().replace(/[.,;:!?]/g, '');
            if (synonymMap[lowerWord]) {
                expandedWords.push(...synonymMap[lowerWord]);
            }
        }

        return expandedWords.join(' ');
    }
}
