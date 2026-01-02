import { MultiDbManager } from '../core/multi-db-manager';
import { AdrRepository } from '../repositories/adr-repository';
import { ModuleRepository } from '../repositories/module-repository';
import { Adr } from '../models/adr';
import { Module } from '../models/module';
import * as path from 'path';

/**
 * ADR Pattern extracted from existing ADRs
 */
export interface AdrPattern {
    patternType: string;  // e.g., "Repository", "API Layer", "Service Layer"
    modulePath: string;
    adrNumber: string;
    adrTitle: string;
    sections: Map<string, string>;  // Section name → content
    structure: AdrStructure;
}

/**
 * ADR Structure template
 */
export interface AdrStructure {
    requiredSections: string[];
    optionalSections: string[];
    sectionOrder: string[];
    commonPatterns: string[];
}

/**
 * Pattern mapping: pattern type → ADR structure
 */
export interface AdrPatternMap {
    patterns: Map<string, AdrPattern[]>;  // patternType → patterns
    structureTemplates: Map<string, AdrStructure>;  // patternType → structure
}

/**
 * Analyzes existing ADRs to extract patterns and create structure templates.
 * Used for deterministic ADR reconstruction.
 */
export class AdrPatternAnalyzer {
    private dbManager: MultiDbManager;

    constructor(dbManager: MultiDbManager) {
        this.dbManager = dbManager;
    }

    /**
     * Analyzes all ADRs and extracts patterns.
     */
    public async analyzeAdrPatterns(pluginId: string): Promise<AdrPatternMap> {
        const adrDb = await this.dbManager.getDatabase('W');
        const moduleDb = await this.dbManager.getDatabase('X');
        
        const adrRepo = new AdrRepository(adrDb);
        const moduleRepo = new ModuleRepository(moduleDb);
        
        const allAdrs = await adrRepo.getAll(pluginId);
        const allModules = await moduleRepo.getAll(pluginId);
        
        const patterns: AdrPattern[] = [];
        
        // Extract patterns from each ADR
        for (const adr of allAdrs) {
            const fileMappings = await adrRepo.getAdrFileMappings(adr.id);
            
            // Find modules referenced by this ADR
            for (const mapping of fileMappings) {
                const module = allModules.find(m => m.file_path === mapping.file_path);
                if (module) {
                    const pattern = this.extractPatternsFromAdr(adr, module);
                    patterns.push(pattern);
                }
            }
        }
        
        // Group patterns by type
        const patternMap = new Map<string, AdrPattern[]>();
        for (const pattern of patterns) {
            if (!patternMap.has(pattern.patternType)) {
                patternMap.set(pattern.patternType, []);
            }
            patternMap.get(pattern.patternType)!.push(pattern);
        }
        
        // Build structure templates for each pattern type
        const structureTemplates = new Map<string, AdrStructure>();
        for (const [patternType, patternList] of patternMap.entries()) {
            const structure = this.buildPatternTemplate(patternList);
            structureTemplates.set(patternType, structure);
        }
        
        return {
            patterns: patternMap,
            structureTemplates
        };
    }

    /**
     * Extracts patterns from an ADR and its associated module.
     */
    public extractPatternsFromAdr(adr: Adr, module: Module): AdrPattern {
        const patternType = this.detectPatternType(module.file_path);
        const sections = this.extractSections(adr.content_markdown);
        const structure = this.analyzeStructure(adr.content_markdown);
        
        return {
            patternType,
            modulePath: module.file_path,
            adrNumber: adr.adr_number,
            adrTitle: adr.title,
            sections,
            structure
        };
    }

    /**
     * Finds similar ADR patterns for a target module.
     */
    public async findSimilarAdrPatterns(
        targetModule: Module,
        pluginId: string
    ): Promise<AdrPattern[]> {
        const patternMap = await this.analyzeAdrPatterns(pluginId);
        const targetPatternType = this.detectPatternType(targetModule.file_path);
        
        // Find patterns of the same type
        const sameTypePatterns = patternMap.patterns.get(targetPatternType) || [];
        
        // Also include similar pattern types
        const similarPatterns: AdrPattern[] = [];
        
        // Repository patterns are similar to each other
        if (targetPatternType === 'Repository') {
            const repoPatterns = patternMap.patterns.get('Repository') || [];
            similarPatterns.push(...repoPatterns);
        }
        
        // API patterns are similar to each other
        if (targetPatternType === 'API Layer') {
            const apiPatterns = patternMap.patterns.get('API Layer') || [];
            similarPatterns.push(...apiPatterns);
        }
        
        // Service patterns are similar to each other
        if (targetPatternType === 'Service Layer') {
            const servicePatterns = patternMap.patterns.get('Service Layer') || [];
            similarPatterns.push(...servicePatterns);
        }
        
        // Combine and deduplicate
        const allPatterns = [...sameTypePatterns, ...similarPatterns];
        const uniquePatterns = Array.from(
            new Map(allPatterns.map(p => [p.adrNumber, p])).values()
        );
        
        return uniquePatterns;
    }

    /**
     * Builds a structure template from a list of patterns.
     */
    public buildPatternTemplate(patterns: AdrPattern[]): AdrStructure {
        if (patterns.length === 0) {
            return {
                requiredSections: ['Status', 'Kontext', 'Entscheidung', 'Konsequenzen'],
                optionalSections: ['Alternativen', 'Verweise', 'Implementierung'],
                sectionOrder: ['Status', 'Kontext', 'Entscheidung', 'Konsequenzen', 'Verweise'],
                commonPatterns: []
            };
        }
        
        // Collect all sections from all patterns
        const allSections = new Set<string>();
        const sectionFrequency = new Map<string, number>();
        
        for (const pattern of patterns) {
            for (const sectionName of pattern.structure.requiredSections) {
                allSections.add(sectionName);
                sectionFrequency.set(sectionName, (sectionFrequency.get(sectionName) || 0) + 1);
            }
            for (const sectionName of pattern.structure.optionalSections) {
                allSections.add(sectionName);
                sectionFrequency.set(sectionName, (sectionFrequency.get(sectionName) || 0) + 1);
            }
        }
        
        // Required sections appear in >80% of patterns
        const requiredSections: string[] = [];
        const optionalSections: string[] = [];
        const threshold = patterns.length * 0.8;
        
        for (const section of allSections) {
            const frequency = sectionFrequency.get(section) || 0;
            if (frequency >= threshold) {
                requiredSections.push(section);
            } else {
                optionalSections.push(section);
            }
        }
        
        // Determine section order (most common order)
        const sectionOrder = this.determineSectionOrder(patterns);
        
        // Extract common patterns from section content
        const commonPatterns = this.extractCommonPatterns(patterns);
        
        return {
            requiredSections,
            optionalSections,
            sectionOrder,
            commonPatterns
        };
    }

    /**
     * Detects pattern type from file path.
     */
    private detectPatternType(filePath: string): string {
        const fileName = path.basename(filePath, path.extname(filePath)).toLowerCase();
        const dirName = path.dirname(filePath).toLowerCase();
        
        // Repository Pattern
        if (fileName.includes('repository') || dirName.includes('repositories')) {
            return 'Repository';
        }
        
        // API Layer Pattern
        if (fileName.includes('api') || dirName.includes('/api/')) {
            return 'API Layer';
        }
        
        // Service Layer Pattern
        if (dirName.includes('/services/')) {
            return 'Service Layer';
        }
        
        // Builder Pattern
        if (fileName.includes('builder') || fileName.includes('build')) {
            return 'Builder';
        }
        
        // Ingestor Pattern
        if (fileName.includes('ingestor') || dirName.includes('ingestors')) {
            return 'Ingestor';
        }
        
        // CLI Pattern
        if (fileName.includes('cli') || dirName.includes('/cli/')) {
            return 'CLI';
        }
        
        // Core Pattern
        if (dirName.includes('/core/')) {
            return 'Core';
        }
        
        // Default: Generic
        return 'Generic';
    }

    /**
     * Extracts sections from ADR markdown content.
     */
    private extractSections(content: string): Map<string, string> {
        const sections = new Map<string, string>();
        const lines = content.split('\n');
        
        let currentSection: string | null = null;
        let currentContent: string[] = [];
        
        for (const line of lines) {
            // Check for section headers (## or ###)
            const sectionMatch = line.match(/^##+\s+(.+)$/);
            if (sectionMatch) {
                // Save previous section
                if (currentSection) {
                    sections.set(currentSection, currentContent.join('\n').trim());
                }
                
                // Start new section
                currentSection = sectionMatch[1].trim();
                currentContent = [];
            } else if (currentSection) {
                currentContent.push(line);
            }
        }
        
        // Save last section
        if (currentSection) {
            sections.set(currentSection, currentContent.join('\n').trim());
        }
        
        return sections;
    }

    /**
     * Analyzes ADR structure from markdown content.
     */
    private analyzeStructure(content: string): AdrStructure {
        const sections = this.extractSections(content);
        const sectionNames = Array.from(sections.keys());
        
        // Common required sections
        const commonRequired = ['Status', 'Kontext', 'Context', 'Entscheidung', 'Decision', 'Konsequenzen', 'Consequences'];
        const requiredSections = sectionNames.filter(name => 
            commonRequired.some(req => name.toLowerCase().includes(req.toLowerCase()))
        );
        
        // Optional sections are the rest
        const optionalSections = sectionNames.filter(name => 
            !requiredSections.includes(name)
        );
        
        // Section order is the order they appear in the document
        const sectionOrder = sectionNames;
        
        return {
            requiredSections,
            optionalSections,
            sectionOrder,
            commonPatterns: []
        };
    }

    /**
     * Determines the most common section order from patterns.
     */
    private determineSectionOrder(patterns: AdrPattern[]): string[] {
        if (patterns.length === 0) {
            return ['Status', 'Kontext', 'Entscheidung', 'Konsequenzen'];
        }
        
        // Count section positions
        const positionCounts = new Map<string, Map<number, number>>();
        
        for (const pattern of patterns) {
            pattern.structure.sectionOrder.forEach((section, index) => {
                if (!positionCounts.has(section)) {
                    positionCounts.set(section, new Map());
                }
                const counts = positionCounts.get(section)!;
                counts.set(index, (counts.get(index) || 0) + 1);
            });
        }
        
        // Find most common position for each section
        const sectionPositions = new Map<string, number>();
        for (const [section, positions] of positionCounts.entries()) {
            let maxCount = 0;
            let bestPosition = 0;
            for (const [position, count] of positions.entries()) {
                if (count > maxCount) {
                    maxCount = count;
                    bestPosition = position;
                }
            }
            sectionPositions.set(section, bestPosition);
        }
        
        // Sort sections by their most common position
        const sortedSections = Array.from(sectionPositions.entries())
            .sort((a, b) => a[1] - b[1])
            .map(([section]) => section);
        
        return sortedSections.length > 0 ? sortedSections : ['Status', 'Kontext', 'Entscheidung', 'Konsequenzen'];
    }

    /**
     * Extracts common patterns from pattern content.
     */
    private extractCommonPatterns(patterns: AdrPattern[]): string[] {
        const commonPatterns: string[] = [];
        
        // Analyze section content for common phrases
        const phraseFrequency = new Map<string, number>();
        
        for (const pattern of patterns) {
            for (const [sectionName, content] of pattern.sections.entries()) {
                // Extract key phrases (simple heuristic: words in quotes or code blocks)
                const phrases = content.match(/`([^`]+)`|"([^"]+)"/g) || [];
                for (const phrase of phrases) {
                    const cleanPhrase = phrase.replace(/[`"]/g, '').trim();
                    if (cleanPhrase.length > 5) {
                        phraseFrequency.set(cleanPhrase, (phraseFrequency.get(cleanPhrase) || 0) + 1);
                    }
                }
            }
        }
        
        // Find phrases that appear in >50% of patterns
        const threshold = patterns.length * 0.5;
        for (const [phrase, count] of phraseFrequency.entries()) {
            if (count >= threshold) {
                commonPatterns.push(phrase);
            }
        }
        
        return commonPatterns;
    }
}

