import { MultiDbManager } from '../../core/multi-db-manager';
import { IdMapper } from '../../core/id-mapper';
import { CrossDimensionApi } from '../../api/cross-dimension-api';
import { ModuleApi } from '../../api/module-api';
import { EmbeddingGenerator } from '../../embedding/embedding-generator';
import { AdrPatternAnalyzer } from '../../services/adr-pattern-analyzer';
import { SemanticPatternMatcher } from '../../services/semantic-pattern-matcher';
import { AdrContextBuilder, ModuleContext } from '../../services/adr-context-builder';
import { AdrReasoningService } from '../../services/adr-reasoning-service';
import * as fs from 'fs';
import * as path from 'path';

/**
 * MCP Tool: adr_generator
 * Deterministically reconstructs ADRs from 5D dimensions.
 * Uses similar modules, existing ADRs, and patterns to reconstruct implicit knowledge.
 */
export class AdrGeneratorTool {
    private crossDimensionApi: CrossDimensionApi;
    private moduleApi: ModuleApi;
    private patternAnalyzer: AdrPatternAnalyzer;
    private patternMatcher: SemanticPatternMatcher;
    private contextBuilder: AdrContextBuilder;
    private reasoningService: AdrReasoningService;
    private workspaceRoot: string;
    private dbManager: MultiDbManager;
    private idMapper: IdMapper;

    constructor(dbManager: MultiDbManager, idMapper: IdMapper, workspaceRoot: string) {
        this.dbManager = dbManager;
        this.idMapper = idMapper;
        this.workspaceRoot = workspaceRoot;
        this.crossDimensionApi = new CrossDimensionApi(dbManager, idMapper);
        this.moduleApi = new ModuleApi(dbManager);
        this.patternAnalyzer = new AdrPatternAnalyzer(dbManager);
        
        const embeddingGenerator = new EmbeddingGenerator();
        this.patternMatcher = new SemanticPatternMatcher(dbManager, idMapper, embeddingGenerator);
        this.contextBuilder = new AdrContextBuilder(dbManager, idMapper, this.patternMatcher);
        this.reasoningService = new AdrReasoningService();
    }

    /**
     * Executes the adr_generator tool.
     * Reconstructs ADRs for modules without ADRs.
     * 
     * @param args Arguments: pluginId, minDependencies (default: 5), dryRun (default: false), limit (default: 10), useLLM (default: false), llmModel (default: gpt-4o-mini)
     * @returns JSON string with generation results
     */
    public async execute(args: {
        pluginId: string;
        minDependencies?: number;
        dryRun?: boolean;
        limit?: number;
        useLLM?: boolean;
        llmModel?: string;
    }): Promise<string> {
        // Default: Only generate ADRs for modules with at least 5 dependencies
        // This prevents system overload from too many simple modules
        const minDeps = args.minDependencies !== undefined ? args.minDependencies : 5;
        const dryRun = args.dryRun !== undefined ? args.dryRun : false;
        const limit = args.limit || 10;

        // Get architectural view to find gaps
        const architecturalView = await this.crossDimensionApi.buildArchitecturalView(args.pluginId);
        
        // Find modules without ADRs
        // Filter: must have at least minDeps dependencies (default: 3)
        // This prevents system overload from generating ADRs for too many simple modules
        const modulesWithoutAdrs = architecturalView
            .filter(view => view.dependencies.length >= minDeps && view.adrs.length === 0)
            .sort((a, b) => b.dependencies.length - a.dependencies.length)
            .slice(0, limit);

        const results: Array<{
            module_path: string;
            adr_number: string;
            adr_file: string;
            generated: boolean;
            content_preview: string;
        }> = [];

        // Find next available ADR number
        const nextAdrNumber = await this.findNextAdrNumber(args.pluginId);

        for (let i = 0; i < modulesWithoutAdrs.length; i++) {
            const view = modulesWithoutAdrs[i];
            const module = view.module;
            const adrNumber = this.formatAdrNumber(nextAdrNumber + i);
            const adrFileName = `${adrNumber}-${this.generateSlug(module.file_path)}.md`;
            const adrPath = path.join(this.workspaceRoot, 'docs', 'adr', adrFileName);

            // Reconstruct ADR content (with or without LLM)
            const useLLM = args.useLLM === true && this.reasoningService.isAvailable();
            const adrContent = await this.reconstructAdr(module, args.pluginId, adrNumber, useLLM);

            if (!dryRun) {
                // Ensure docs/adr directory exists
                const adrDir = path.dirname(adrPath);
                if (!fs.existsSync(adrDir)) {
                    fs.mkdirSync(adrDir, { recursive: true });
                }

                // Write ADR file
                fs.writeFileSync(adrPath, adrContent, 'utf-8');
            }

            results.push({
                module_path: module.file_path,
                adr_number: adrNumber,
                adr_file: adrFileName,
                generated: !dryRun,
                content_preview: adrContent.substring(0, 500) + '...'
            });
        }

        return JSON.stringify({
            summary: {
                modules_analyzed: architecturalView.length,
                modules_without_adrs: modulesWithoutAdrs.length,
                adrs_generated: results.length,
                dry_run: dryRun,
                next_adr_number: nextAdrNumber
            },
            generated_adrs: results,
            recommendations: dryRun 
                ? [`Run without --dry-run to actually generate ${results.length} ADR(s)`]
                : [`Generated ${results.length} ADR(s) deterministically from 5D dimensions.`]
        }, null, 2);
    }

    /**
     * Calculates module complexity based on dependencies, symbols, and incoming dependencies.
     * Returns 'simple', 'medium', or 'complex'.
     * 
     * Rules:
     * - >= 20 dependencies → automatically 'complex'
     * - >= 15 incoming dependencies → automatically 'complex'
     * - >= 30 symbols → automatically 'complex'
     * - Otherwise: scoring system
     */
    private calculateComplexity(context: ModuleContext): 'simple' | 'medium' | 'complex' {
        const depCount = context.dependencies.length;
        const incomingCount = context.incomingDependencies.length;
        const symbolCount = context.symbols.length;
        
        // Automatic 'complex' for very high numbers
        if (depCount >= 20) return 'complex';
        if (incomingCount >= 15) return 'complex';
        if (symbolCount >= 30) return 'complex';
        
        // Scoring: 0-2 = simple, 3-5 = medium, 6+ = complex
        let score = 0;
        
        // Dependencies scoring (more granular)
        if (depCount >= 5) score++;
        if (depCount >= 10) score++;
        if (depCount >= 15) score++; // Additional point for high dependency count
        
        // Incoming dependencies scoring
        if (incomingCount >= 3) score++;
        if (incomingCount >= 8) score++; // Increased threshold
        
        // Symbols scoring
        if (symbolCount >= 5) score++;
        if (symbolCount >= 15) score++;
        if (symbolCount >= 25) score++; // Additional point for very high symbol count
        
        if (score <= 2) return 'simple';
        if (score <= 5) return 'medium';
        return 'complex';
    }

    /**
     * Reconstructs an ADR from 5D dimensions (with optional LLM for "Why").
     */
    private async reconstructAdr(
        module: any,
        pluginId: string,
        adrNumber: string,
        useLLM: boolean = false
    ): Promise<string> {
        // Build complete context from all dimensions
        const context = await this.contextBuilder.buildModuleContext(module, pluginId);
        
        // Calculate complexity
        const complexity = this.calculateComplexity(context);
        
        // Find similar ADR patterns
        const similarPatterns = await this.patternAnalyzer.findSimilarAdrPatterns(module, pluginId);
        
        // Get ADRs for similar modules
        const similarAdrs = await this.patternMatcher.findAdrsForSimilarModules(module, pluginId);
        
        // Extract title from module or similar ADRs
        const title = this.extractTitle(module, similarAdrs);
        
        // Use LLM for "Why" reconstruction if available and requested
        let reasoning: any = null;
        if (useLLM) {
            if (!this.reasoningService.isAvailable()) {
                console.warn(`[AdrGeneratorTool] LLM not available (OpenAI API key not configured). Falling back to deterministic method.`);
            } else {
                try {
                    const similarAdrList = similarAdrs.map(sa => sa.adr);
                    reasoning = await this.reasoningService.reconstructWhy(
                        context,
                        similarAdrList,
                        context.patterns,
                        complexity
                    );
                    console.log(`[AdrGeneratorTool] Successfully reconstructed reasoning using LLM for ${module.file_path}`);
                } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    console.warn(`[AdrGeneratorTool] LLM reasoning failed, falling back to deterministic method: ${errorMsg}`);
                    // Fall through to deterministic method
                }
            }
        }
        
        // Reconstruct each section (use LLM reasoning if available)
        const status = this.reconstructStatus();
        const contextSection = await this.reconstructContext(context, similarAdrs, reasoning, complexity);
        const decisionSection = await this.reconstructDecision(context, similarAdrs, reasoning, complexity);
        const consequencesSection = await this.reconstructConsequences(context, reasoning, complexity);
        const refactoringSection = this.reconstructRefactoringRecommendations(reasoning, complexity);
        const verweiseSection = this.reconstructVerweise(context, similarAdrs);
        
        // Build ADR content
        let adrContent = `# ADR-${adrNumber}: ${title}

## Status

${status}

## Kontext

${contextSection}

## Entscheidung

${decisionSection}

## Konsequenzen

${consequencesSection}

## Verweise

${verweiseSection}
`;

        // Add refactoring recommendations if available
        if (refactoringSection) {
            adrContent += `\n${refactoringSection}\n`;
        }
        
        // Add implementation section for complex modules (similar to ADR-038)
        if (complexity === 'complex') {
            const implementationSection = this.reconstructImplementation(context, reasoning);
            if (implementationSection) {
                adrContent += `\n${implementationSection}\n`;
            }
        }
        
        return adrContent;
    }
    
    /**
     * Reconstructs Refactoring Recommendations section from LLM reasoning.
     * Skips recommendations for simple modules.
     */
    private reconstructRefactoringRecommendations(reasoning: any, complexity: 'simple' | 'medium' | 'complex' = 'complex'): string {
        // Skip refactoring recommendations for simple modules
        if (complexity === 'simple') {
            return '';
        }
        
        if (!reasoning || !reasoning.refactoring_recommendations || reasoning.refactoring_recommendations.length === 0) {
            return '';
        }
        
        let refactoringText = `## Refactoring-Empfehlungen\n\n`;
        
        // Limit recommendations based on complexity
        const maxRecommendations = complexity === 'medium' ? 2 : reasoning.refactoring_recommendations.length;
        
        for (const recommendation of reasoning.refactoring_recommendations.slice(0, maxRecommendations)) {
            refactoringText += `- ${recommendation}\n`;
        }
        
        return refactoringText;
    }

    /**
     * Reconstructs Status section.
     */
    private reconstructStatus(): string {
        return 'Proposed';
    }

    /**
     * Reconstructs Context section from module context and similar ADRs.
     * Uses LLM reasoning if available for problem identification.
     * Adjusts detail level based on module complexity.
     */
    private async reconstructContext(
        context: ModuleContext,
        similarAdrs: Array<{ adr: any; module: any; similarityScore: number }>,
        reasoning: any = null,
        complexity: 'simple' | 'medium' | 'complex' = 'complex'
    ): Promise<string> {
        const module = context.module;
        const moduleName = path.basename(module.file_path, path.extname(module.file_path));
        const moduleDir = path.dirname(module.file_path);
        
        // Parse module documentation for detailed information
        const moduleDoc = this.parseModuleDocumentation(module.content_markdown);
        
        let contextText = `Dieses Modul (\`${module.file_path}\`) ist Teil der Architektur.`;
        
        // Add problems from LLM reasoning if available
        // Limit problems based on complexity
        if (reasoning && reasoning.problems && reasoning.problems.length > 0) {
            contextText += `\n\n**Problem:**\n\n`;
            const maxProblems = complexity === 'simple' ? 2 : complexity === 'medium' ? 3 : reasoning.problems.length;
            for (let i = 0; i < Math.min(reasoning.problems.length, maxProblems); i++) {
                contextText += `**Problem ${i + 1}:** ${reasoning.problems[i]}\n\n`;
            }
        }
        
        // Add module purpose from documentation
        if (moduleDoc.purpose) {
            contextText += `**Zweck:** ${moduleDoc.purpose}\n\n`;
        }
        
        // Add detailed class/interface information (limit based on complexity)
        if (moduleDoc.classes.length > 0) {
            const maxClasses = complexity === 'simple' ? 2 : complexity === 'medium' ? 3 : 5;
            contextText += `\n\n**Hauptklassen/Interfaces:**`;
            for (const cls of moduleDoc.classes.slice(0, maxClasses)) {
                contextText += `\n- \`${cls.name}\` (${cls.role || 'other'})`;
                if (cls.methodCount > 0 && complexity !== 'simple') {
                    contextText += ` - ${cls.methodCount} Methoden`;
                }
            }
        }
        
        // Add key functions/methods (limit based on complexity)
        if (moduleDoc.keyFunctions.length > 0) {
            const maxFunctions = complexity === 'simple' ? 2 : complexity === 'medium' ? 5 : 10;
            contextText += `\n\n**Hauptfunktionen:**`;
            for (const func of moduleDoc.keyFunctions.slice(0, maxFunctions)) {
                contextText += `\n- \`${func.name}()\` - ${func.role || 'other'}`;
                if (func.signature && complexity !== 'simple') {
                    const sigPreview = func.signature.length > 80 ? func.signature.substring(0, 80) + '...' : func.signature;
                    contextText += `\n  \`${sigPreview}\``;
                }
            }
        }
        
        // Add detailed dependencies analysis (simplified for simple modules)
        if (context.dependencies.length > 0) {
            if (complexity === 'simple') {
                // For simple modules, just show count
                contextText += `\n\n**Dependencies (${context.dependencies.length}):**`;
            } else {
                contextText += `\n\n**Dependencies (${context.dependencies.length}):**`;
                
                // Group by dependency category
                const coreDeps: string[] = [];
                const apiDeps: string[] = [];
                const serviceDeps: string[] = [];
                const otherDeps: string[] = [];
                
                for (const dep of context.dependencies) {
                    const toModule = (dep as any).to_module || '';
                    if (toModule.includes('/core/')) {
                        coreDeps.push(toModule);
                    } else if (toModule.includes('/api/')) {
                        apiDeps.push(toModule);
                    } else if (toModule.includes('/services/')) {
                        serviceDeps.push(toModule);
                    } else {
                        otherDeps.push(toModule);
                    }
                }
                
                const maxDeps = complexity === 'medium' ? 5 : 10;
                
                if (coreDeps.length > 0) {
                    contextText += `\n\n**Core Dependencies (${coreDeps.length}):**`;
                    for (const dep of coreDeps.slice(0, maxDeps)) {
                        contextText += `\n- \`${dep}\``;
                    }
                }
                
                if (apiDeps.length > 0) {
                    contextText += `\n\n**API Dependencies (${apiDeps.length}):**`;
                    for (const dep of apiDeps.slice(0, maxDeps)) {
                        contextText += `\n- \`${dep}\``;
                    }
                }
                
                if (serviceDeps.length > 0) {
                    contextText += `\n\n**Service Dependencies (${serviceDeps.length}):**`;
                    for (const dep of serviceDeps.slice(0, maxDeps)) {
                        contextText += `\n- \`${dep}\``;
                    }
                }
                
                if (otherDeps.length > 0 && (complexity === 'complex' || otherDeps.length <= 10)) {
                    contextText += `\n\n**Weitere Dependencies (${otherDeps.length}):**`;
                    const maxOtherDeps = complexity === 'medium' ? 5 : otherDeps.length;
                    for (const dep of otherDeps.slice(0, maxOtherDeps)) {
                        contextText += `\n- \`${dep}\``;
                    }
                }
            }
        }
        
        // Add incoming dependencies (who uses this module) - skip for simple modules
        if (context.incomingDependencies.length > 0 && complexity !== 'simple') {
            const maxUsers = complexity === 'medium' ? 5 : 10;
            contextText += `\n\n**Wird genutzt von (${context.incomingDependencies.length} Modulen):**`;
            const uniqueUsers = new Set(context.incomingDependencies.map((d: any) => d.from_module || d.from));
            for (const user of Array.from(uniqueUsers).slice(0, maxUsers)) {
                contextText += `\n- \`${user}\``;
            }
        }
        
        // Add pattern information with evidence (skip for simple modules)
        if (context.patterns.length > 0 && complexity !== 'simple') {
            const primaryPattern = context.patterns[0];
            contextText += `\n\n**Erkanntes Pattern:** ${primaryPattern.pattern} (${primaryPattern.confidence} confidence)`;
            if (primaryPattern.evidence.length > 0 && complexity === 'complex') {
                contextText += `\n\n**Evidence:**`;
                for (const evidence of primaryPattern.evidence.slice(0, 5)) {
                    contextText += `\n- ${evidence}`;
                }
            }
        }
        
        // Add similar modules with context (skip for simple modules)
        if (context.similarModules.length > 0 && complexity !== 'simple') {
            contextText += `\n\n**Ähnliche Module:**`;
            const maxSimilar = complexity === 'medium' ? 2 : 3;
            for (const similar of context.similarModules.slice(0, maxSimilar)) {
                contextText += `\n- \`${similar.module.file_path}\` (Similarity: ${(similar.score * 100).toFixed(0)}%)`;
            }
        }
        
        // Add symbols summary with details (simplified for simple modules)
        if (context.symbols.length > 0 && complexity !== 'simple') {
            contextText += `\n\n**Symbole (${context.symbols.length}):**`;
            const symbolKinds = new Map<string, Array<{ name: string; signature?: string }>>();
            for (const symbol of context.symbols) {
                const kind = (symbol as any).kind || 'unknown';
                if (!symbolKinds.has(kind)) {
                    symbolKinds.set(kind, []);
                }
                const sig = (symbol as any).signature_json ? JSON.parse((symbol as any).signature_json) : null;
                symbolKinds.get(kind)!.push({
                    name: (symbol as any).name || 'unknown',
                    signature: sig ? JSON.stringify(sig).substring(0, 100) : undefined
                });
            }
            
            const maxSymbolsPerKind = complexity === 'medium' ? 3 : 5;
            for (const [kind, symbols] of symbolKinds.entries()) {
                contextText += `\n\n**${kind} (${symbols.length}):**`;
                for (const sym of symbols.slice(0, maxSymbolsPerKind)) {
                    contextText += `\n- \`${sym.name}\``;
                }
                if (symbols.length > maxSymbolsPerKind) {
                    contextText += `\n- ... und ${symbols.length - maxSymbolsPerKind} weitere`;
                }
            }
        }
        
        return contextText;
    }
    
    /**
     * Parses module documentation markdown to extract structured information.
     */
    private parseModuleDocumentation(content: string): {
        purpose: string | null;
        classes: Array<{ name: string; role: string | null; methodCount: number }>;
        keyFunctions: Array<{ name: string; role: string | null; signature: string | null }>;
    } {
        const lines = content.split('\n');
        const result = {
            purpose: null as string | null,
            classes: [] as Array<{ name: string; role: string | null; methodCount: number }>,
            keyFunctions: [] as Array<{ name: string; role: string | null; signature: string | null }>
        };
        
        let currentClass: { name: string; role: string | null; methodCount: number } | null = null;
        let methodCount = 0;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Extract purpose from first paragraph after title
            if (line.startsWith('# Modul:') && i + 1 < lines.length) {
                const nextLine = lines[i + 1].trim();
                if (nextLine && !nextLine.startsWith('#')) {
                    result.purpose = nextLine.substring(0, 200);
                }
            }
            
            // Extract class information
            const classMatch = line.match(/^###\s+(?:class|interface):\s*(.+)$/);
            if (classMatch) {
                if (currentClass) {
                    currentClass.methodCount = methodCount;
                    result.classes.push(currentClass);
                }
                const className = classMatch[1].trim();
                const roleMatch = line.match(/Rolle:\s*([^,]+)/);
                const role = roleMatch ? roleMatch[1].trim() : null;
                currentClass = { name: className, role, methodCount: 0 };
                methodCount = 0;
            }
            
            // Extract method information
            const methodMatch = line.match(/^###\s+(?:method|function):\s*(.+)$/);
            if (methodMatch) {
                methodCount++;
                const methodName = methodMatch[1].trim();
                const roleMatch = line.match(/Rolle:\s*([^,]+)/);
                const role = roleMatch ? roleMatch[1].trim() : null;
                
                // Try to find signature in next lines
                let signature: string | null = null;
                for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
                    if (lines[j].includes('Signatur:') || lines[j].includes('```')) {
                        const sigMatch = lines[j].match(/Signatur:\s*`(.+)`/) || 
                                        lines[j + 1]?.match(/```ts\n(.+)\n```/);
                        if (sigMatch) {
                            signature = sigMatch[1].trim();
                            break;
                        }
                    }
                }
                
                result.keyFunctions.push({ name: methodName, role, signature });
            }
        }
        
        if (currentClass) {
            currentClass.methodCount = methodCount;
            result.classes.push(currentClass);
        }
        
        return result;
    }

    /**
     * Reconstructs Decision section from patterns and similar ADRs.
     * Uses LLM reasoning if available for decision and rationale.
     * Adjusts detail level based on module complexity.
     */
    private async reconstructDecision(
        context: ModuleContext,
        similarAdrs: Array<{ adr: any; module: any; similarityScore: number }>,
        reasoning: any = null,
        complexity: 'simple' | 'medium' | 'complex' = 'complex'
    ): Promise<string> {
        let decisionText = '';
        
        // Use LLM reasoning if available
        if (reasoning && reasoning.decision) {
            decisionText += reasoning.decision;
            
            if (reasoning.rationale) {
                decisionText += `\n\n**Begründung:**\n\n${reasoning.rationale}`;
            }
            
            // Limit alternatives based on complexity
            if (reasoning.alternatives && reasoning.alternatives.length > 0) {
                const maxAlternatives = complexity === 'simple' ? 1 : complexity === 'medium' ? 2 : reasoning.alternatives.length;
                if (maxAlternatives > 0) {
                    decisionText += `\n\n**Alternativen, die erwogen wurden:**\n\n`;
                    for (const alt of reasoning.alternatives.slice(0, maxAlternatives)) {
                        decisionText += `- ${alt}\n`;
                    }
                }
            }
            
            return decisionText;
        }
        
        // Fallback to deterministic method
        // Parse module documentation for decision context
        const moduleDoc = this.parseModuleDocumentation(context.module.content_markdown);
        
        // Use similar ADRs as template with deeper analysis
        if (similarAdrs.length > 0) {
            const bestMatch = similarAdrs[0];
            const similarAdrContent = bestMatch.adr.content_markdown;
            
            // Extract full Context and Decision sections from similar ADR
            const contextMatch = similarAdrContent.match(/##\s+Kontext\s*\n([\s\S]*?)(?=##\s+(?:Entscheidung|Decision)|$)/i);
            const decisionMatch = similarAdrContent.match(/##\s+Entscheidung\s*\n([\s\S]*?)(?=##|$)/i);
            
            if (decisionMatch) {
                decisionText += `Basierend auf ähnlichem Modul \`${bestMatch.module.file_path}\` (ADR-${bestMatch.adr.adr_number}):\n\n`;
                
                // Extract decision structure from similar ADR
                const similarDecision = decisionMatch[1].trim();
                
                // Analyze decision structure (subsections, implementation details)
                const decisionStructure = this.analyzeDecisionStructure(similarDecision);
                
                // Adapt decision with module-specific details
                decisionText += this.adaptDecisionTextDeep(
                    similarDecision,
                    decisionStructure,
                    context.module,
                    bestMatch.module,
                    moduleDoc,
                    context
                );
            } else {
                decisionText += this.generateDecisionFromPatterns(context, moduleDoc);
            }
        } else {
            decisionText += this.generateDecisionFromPatterns(context, moduleDoc);
        }
        
        return decisionText;
    }
    
    /**
     * Analyzes decision structure from similar ADR.
     */
    private analyzeDecisionStructure(decisionText: string): {
        subsections: Array<{ title: string; content: string }>;
        implementationDetails: string[];
        rationale: string | null;
    } {
        const lines = decisionText.split('\n');
        const result = {
            subsections: [] as Array<{ title: string; content: string }>,
            implementationDetails: [] as string[],
            rationale: null as string | null
        };
        
        let currentSubsection: { title: string; content: string } | null = null;
        let currentContent: string[] = [];
        
        for (const line of lines) {
            // Check for subsection (### or ####)
            const subsectionMatch = line.match(/^###+\s+(.+)$/);
            if (subsectionMatch) {
                if (currentSubsection) {
                    currentSubsection.content = currentContent.join('\n').trim();
                    result.subsections.push(currentSubsection);
                }
                currentSubsection = { title: subsectionMatch[1].trim(), content: '' };
                currentContent = [];
            } else if (currentSubsection) {
                currentContent.push(line);
            } else {
                // Main rationale
                if (line.trim() && !line.startsWith('#')) {
                    if (!result.rationale) {
                        result.rationale = '';
                    }
                    result.rationale += line + '\n';
                }
            }
            
            // Extract implementation details (file paths, function names)
            const fileMatch = line.match(/`([^`]+\.ts)`/);
            if (fileMatch) {
                result.implementationDetails.push(fileMatch[1]);
            }
        }
        
        if (currentSubsection) {
            currentSubsection.content = currentContent.join('\n').trim();
            result.subsections.push(currentSubsection);
        }
        
        if (result.rationale) {
            result.rationale = result.rationale.trim();
        }
        
        return result;
    }
    
    /**
     * Deep adaptation of decision text with module-specific details.
     */
    private adaptDecisionTextDeep(
        similarDecision: string,
        decisionStructure: { subsections: Array<{ title: string; content: string }>; implementationDetails: string[]; rationale: string | null },
        targetModule: any,
        similarModule: any,
        moduleDoc: { purpose: string | null; classes: Array<{ name: string; role: string | null; methodCount: number }>; keyFunctions: Array<{ name: string; role: string | null; signature: string | null }> },
        context: ModuleContext
    ): string {
        let adapted = similarDecision;
        
        // Replace module paths
        adapted = adapted.replace(
            new RegExp(similarModule.file_path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
            targetModule.file_path
        );
        
        // Replace module names
        const similarName = path.basename(similarModule.file_path, path.extname(similarModule.file_path));
        const targetName = path.basename(targetModule.file_path, path.extname(targetModule.file_path));
        adapted = adapted.replace(new RegExp(similarName, 'gi'), targetName);
        
        // Add module-specific implementation details
        if (moduleDoc.classes.length > 0) {
            adapted += `\n\n**Implementierung:**\n\n`;
            for (const cls of moduleDoc.classes.slice(0, 3)) {
                adapted += `- **\`${cls.name}\`** (${cls.role || 'other'})`;
                if (cls.methodCount > 0) {
                    adapted += ` - ${cls.methodCount} Methoden`;
                }
                adapted += '\n';
            }
        }
        
        // Add key functions
        if (moduleDoc.keyFunctions.length > 0) {
            adapted += `\n\n**Hauptfunktionen:**\n\n`;
            for (const func of moduleDoc.keyFunctions.slice(0, 5)) {
                adapted += `- \`${func.name}()\``;
                if (func.role) {
                    adapted += ` - ${func.role}`;
                }
                adapted += '\n';
            }
        }
        
        // Add dependency rationale
        if (context.dependencies.length > 0) {
            const coreDeps = context.dependencies.filter((d: any) => (d.to_module || '').includes('/core/'));
            const apiDeps = context.dependencies.filter((d: any) => (d.to_module || '').includes('/api/'));
            
            if (coreDeps.length > 0 || apiDeps.length > 0) {
                adapted += `\n\n**Dependency-Struktur:**\n\n`;
                if (coreDeps.length > 0) {
                    adapted += `- Nutzt ${coreDeps.length} Core-Module für Basis-Funktionalität\n`;
                }
                if (apiDeps.length > 0) {
                    adapted += `- Nutzt ${apiDeps.length} API-Module für Datenzugriff\n`;
                }
            }
        }
        
        return adapted;
    }

    /**
     * Adapts decision text from similar ADR to target module.
     */
    private adaptDecisionText(
        similarDecision: string,
        targetModule: any,
        similarModule: any
    ): string {
        // Replace module paths
        let adapted = similarDecision.replace(
            new RegExp(similarModule.file_path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
            targetModule.file_path
        );
        
        // Replace module names
        const similarName = path.basename(similarModule.file_path, path.extname(similarModule.file_path));
        const targetName = path.basename(targetModule.file_path, path.extname(targetModule.file_path));
        adapted = adapted.replace(new RegExp(similarName, 'gi'), targetName);
        
        return adapted;
    }

    /**
     * Generates decision text from patterns with module-specific details.
     */
    private generateDecisionFromPatterns(
        context: ModuleContext,
        moduleDoc: { purpose: string | null; classes: Array<{ name: string; role: string | null; methodCount: number }>; keyFunctions: Array<{ name: string; role: string | null; signature: string | null }> }
    ): string {
        let decisionText = '';
        
        if (context.patterns.length > 0) {
            const primaryPattern = context.patterns[0];
            decisionText += `**Pattern:** ${primaryPattern.pattern}\n\n`;
            
            // Generate decision based on pattern type with module details
            if (primaryPattern.pattern.includes('Repository')) {
                decisionText += 'Repository Pattern wurde gewählt für Datenbank-Zugriff und Abstraktion der Datenpersistenz.\n\n';
                if (moduleDoc.classes.length > 0) {
                    decisionText += `**Implementierung:**\n`;
                    decisionText += `- \`${moduleDoc.classes[0].name}\` Klasse implementiert Repository-Interface\n`;
                    if (moduleDoc.classes[0].methodCount > 0) {
                        decisionText += `- ${moduleDoc.classes[0].methodCount} Methoden für CRUD-Operationen\n`;
                    }
                }
            } else if (primaryPattern.pattern.includes('API')) {
                decisionText += 'API Layer wurde gewählt für öffentliche Schnittstelle und Abstraktion der internen Implementierung.\n\n';
                if (moduleDoc.keyFunctions.length > 0) {
                    decisionText += `**Public API:**\n`;
                    for (const func of moduleDoc.keyFunctions.slice(0, 5)) {
                        decisionText += `- \`${func.name}()\` - ${func.role || 'public method'}\n`;
                    }
                }
            } else if (primaryPattern.pattern.includes('Service')) {
                decisionText += 'Service Layer wurde gewählt für Geschäftslogik und Orchestrierung.\n\n';
                if (moduleDoc.classes.length > 0) {
                    decisionText += `**Service-Klasse:**\n`;
                    decisionText += `- \`${moduleDoc.classes[0].name}\` orchestriert Geschäftslogik\n`;
                }
            } else if (primaryPattern.pattern.includes('Builder')) {
                decisionText += 'Builder Pattern wurde gewählt für komplexe Objekt-Konstruktion.\n\n';
                if (moduleDoc.classes.length > 0) {
                    decisionText += `**Builder-Klasse:**\n`;
                    decisionText += `- \`${moduleDoc.classes[0].name}\` ermöglicht schrittweise Objekt-Konstruktion\n`;
                }
            } else if (primaryPattern.pattern.includes('UI') || primaryPattern.pattern.includes('View')) {
                decisionText += 'UI-Komponente wurde implementiert für Benutzerinteraktion.\n\n';
                if (moduleDoc.classes.length > 0) {
                    decisionText += `**UI-Klasse:**\n`;
                    decisionText += `- \`${moduleDoc.classes[0].name}\` stellt UI-Funktionalität bereit\n`;
                    if (moduleDoc.classes[0].methodCount > 0) {
                        decisionText += `- ${moduleDoc.classes[0].methodCount} Methoden für UI-Operationen\n`;
                    }
                }
            } else {
                decisionText += `${primaryPattern.pattern} wurde implementiert basierend auf Architektur-Anforderungen.\n\n`;
                if (moduleDoc.purpose) {
                    decisionText += `**Zweck:** ${moduleDoc.purpose}\n\n`;
                }
            }
            
            // Add evidence from pattern
            if (primaryPattern.evidence.length > 0) {
                decisionText += `**Begründung:**\n`;
                for (const evidence of primaryPattern.evidence.slice(0, 3)) {
                    decisionText += `- ${evidence}\n`;
                }
            }
        } else {
            // Fallback: Generate from module structure
            decisionText += 'Dieses Modul wurde implementiert als Teil der System-Architektur.\n\n';
            
            if (moduleDoc.purpose) {
                decisionText += `**Zweck:** ${moduleDoc.purpose}\n\n`;
            }
            
            if (moduleDoc.classes.length > 0) {
                decisionText += `**Implementierung:**\n`;
                for (const cls of moduleDoc.classes.slice(0, 3)) {
                    decisionText += `- \`${cls.name}\` Klasse`;
                    if (cls.role) {
                        decisionText += ` (${cls.role})`;
                    }
                    if (cls.methodCount > 0) {
                        decisionText += ` - ${cls.methodCount} Methoden`;
                    }
                    decisionText += '\n';
                }
            }
            
            if (context.dependencies.length > 0) {
                const coreDeps = context.dependencies.filter((d: any) => (d.to_module || '').includes('/core/'));
                const apiDeps = context.dependencies.filter((d: any) => (d.to_module || '').includes('/api/'));
                
                decisionText += `\n**Dependencies:**\n`;
                if (coreDeps.length > 0) {
                    decisionText += `- ${coreDeps.length} Core-Module für Basis-Funktionalität\n`;
                }
                if (apiDeps.length > 0) {
                    decisionText += `- ${apiDeps.length} API-Module für Datenzugriff\n`;
                }
                if (context.dependencies.length > coreDeps.length + apiDeps.length) {
                    decisionText += `- ${context.dependencies.length - coreDeps.length - apiDeps.length} weitere Module\n`;
                }
            }
            
            if (context.incomingDependencies.length > 0) {
                decisionText += `\n**Nutzung:** Wird von ${context.incomingDependencies.length} anderen Modulen genutzt.\n`;
            }
        }
        
        return decisionText;
    }

    /**
     * Reconstructs Consequences section from dependencies and context.
     * Uses LLM reasoning if available for trade-offs.
     * Adjusts detail level based on module complexity.
     * For complex modules, uses structured format with ✅ and ⚠️ (similar to ADR-038).
     */
    private async reconstructConsequences(
        context: ModuleContext,
        reasoning: any = null,
        complexity: 'simple' | 'medium' | 'complex' = 'complex'
    ): Promise<string> {
        // For complex modules, use structured format like ADR-038
        if (complexity === 'complex') {
            let consequencesText = '### Vorteile\n\n';
            
            // Use LLM reasoning if available
            if (reasoning && reasoning.tradeoffs) {
                const positive = reasoning.tradeoffs.positive || [];
                const negative = reasoning.tradeoffs.negative || [];
                
                if (positive.length > 0) {
                    consequencesText += positive.map((p: string) => `✅ ${p}`).join('\n');
                } else {
                    consequencesText += '✅ Keine spezifischen Vorteile identifiziert\n';
                }
                
                consequencesText += '\n\n### Nachteile\n\n';
                
                if (negative.length > 0) {
                    consequencesText += negative.map((n: string) => `⚠️ ${n}`).join('\n');
                } else {
                    consequencesText += '⚠️ Keine spezifischen Nachteile identifiziert\n';
                }
                
                // Don't add technical details here - they're in the Implementation section
                return consequencesText;
            }
        }
        
        // For simple/medium modules, use simpler format
        let consequencesText = '### Positive\n\n';
        
        // Use LLM reasoning if available
        if (reasoning && reasoning.tradeoffs) {
            const positive = reasoning.tradeoffs.positive || [];
            const negative = reasoning.tradeoffs.negative || [];
            
            // Limit based on complexity
            const maxPositive = complexity === 'simple' ? 2 : complexity === 'medium' ? 3 : positive.length;
            const maxNegative = complexity === 'simple' ? 1 : complexity === 'medium' ? 2 : negative.length;
            
            if (positive.length > 0) {
                consequencesText += positive.slice(0, maxPositive).map((p: string) => `- ${p}`).join('\n');
            } else {
                consequencesText += '- Keine spezifischen Vorteile identifiziert\n';
            }
            
            consequencesText += '\n\n### Negative\n\n';
            
            if (negative.length > 0) {
                consequencesText += negative.slice(0, maxNegative).map((n: string) => `- ${n}`).join('\n');
            } else {
                if (complexity !== 'simple') {
                    consequencesText += '- Keine spezifischen Nachteile identifiziert\n';
                }
            }
            
            return consequencesText;
        }
        
        // Fallback to deterministic method
        const moduleDoc = this.parseModuleDocumentation(context.module.content_markdown);
        const positive: string[] = [];
        const negative: string[] = [];
        
        // Positive: Based on incoming dependencies (who uses this module?) - skip for simple modules
        if (context.incomingDependencies.length > 0 && complexity !== 'simple') {
            const uniqueUsers = new Set(context.incomingDependencies.map((d: any) => d.from_module || d.from));
            positive.push(`Wird von ${uniqueUsers.size} Modul(en) genutzt - zentrale Funktionalität`);
            
            // Show which modules use it (only for medium/complex)
            if (uniqueUsers.size <= 5) {
                positive.push(`  - Genutzt von: ${Array.from(uniqueUsers).map(u => `\`${u}\``).join(', ')}`);
            }
        }
        
        // Positive: Based on module structure
        if (moduleDoc.classes.length > 0) {
            const publicClasses = moduleDoc.classes.filter(c => c.role === 'service-api' || c.role === 'public');
            if (publicClasses.length > 0) {
                positive.push(`Klare öffentliche API durch ${publicClasses.length} öffentliche Klasse(n)`);
            }
        }
        
        if (moduleDoc.keyFunctions.length > 0) {
            const publicFunctions = moduleDoc.keyFunctions.filter(f => f.role === 'service-api' || f.role === 'public');
            if (publicFunctions.length > 0) {
                positive.push(`${publicFunctions.length} öffentliche Funktion(en) für externe Nutzung`);
            }
        }
        
        // Positive: Based on patterns
        if (context.patterns.length > 0) {
            const primaryPattern = context.patterns[0];
            if (primaryPattern.pattern.includes('Repository')) {
                positive.push('Abstraktion der Datenpersistenz');
                positive.push('Testbarkeit durch Mocking');
                positive.push('Einheitliche Datenzugriffs-Schnittstelle');
            } else if (primaryPattern.pattern.includes('API')) {
                positive.push('Klare öffentliche Schnittstelle');
                positive.push('Abstraktion der internen Implementierung');
                positive.push('Stabile API für externe Nutzer');
            } else if (primaryPattern.pattern.includes('Service')) {
                positive.push('Zentrale Geschäftslogik');
                positive.push('Wiederverwendbarkeit');
                positive.push('Orchestrierung komplexer Operationen');
            } else if (primaryPattern.pattern.includes('UI') || primaryPattern.pattern.includes('View')) {
                positive.push('Benutzerfreundliche Oberfläche');
                positive.push('Zentrale UI-Logik');
            }
        }
        
        // Positive: Based on symbol count and structure
        if (context.symbols.length > 0) {
            const methodCount = context.symbols.filter((s: any) => (s.kind || '').includes('method') || (s.kind || '').includes('function')).length;
            if (methodCount > 10) {
                positive.push(`Umfangreiche Funktionalität (${methodCount} Methoden/Funktionen)`);
            }
        }
        
        // Negative: Based on dependencies count and structure
        if (context.dependencies.length > 10) {
            negative.push(`Viele Dependencies (${context.dependencies.length}) - erhöhte Komplexität und Kopplung`);
            
            // Analyze dependency depth
            const coreDeps = context.dependencies.filter((d: any) => (d.to_module || '').includes('/core/'));
            const apiDeps = context.dependencies.filter((d: any) => (d.to_module || '').includes('/api/'));
            const serviceDeps = context.dependencies.filter((d: any) => (d.to_module || '').includes('/services/'));
            
            if (coreDeps.length + apiDeps.length + serviceDeps.length > 10) {
                negative.push(`Tiefe Dependency-Kette (${coreDeps.length} Core, ${apiDeps.length} API, ${serviceDeps.length} Service)`);
            }
        } else if (context.dependencies.length > 5) {
            negative.push(`Mehrere Dependencies (${context.dependencies.length}) - mittlere Komplexität`);
        }
        
        // Negative: Based on patterns
        if (context.patterns.length > 0) {
            const primaryPattern = context.patterns[0];
            if (primaryPattern.pattern.includes('Repository') || primaryPattern.pattern.includes('API')) {
                negative.push('Zusätzliche Abstraktionsschicht - Overhead bei einfachen Operationen');
            }
            if (primaryPattern.pattern.includes('UI') || primaryPattern.pattern.includes('View')) {
                negative.push('UI-Komponente - Abhängigkeit von VS Code APIs');
            }
        }
        
        // Negative: Based on module size
        if (context.symbols.length > 50) {
            negative.push(`Große Modul-Größe (${context.symbols.length} Symbole) - mögliche Wartungsprobleme`);
        }
        
        // Negative: Based on incoming dependencies (high coupling)
        if (context.incomingDependencies.length > 10) {
            negative.push(`Hohe Kopplung - ${context.incomingDependencies.length} Module abhängig - Änderungen haben große Auswirkungen`);
        }
        
        if (positive.length === 0) {
            positive.push('Modulare Architektur');
            if (moduleDoc.classes.length > 0 && complexity !== 'simple') {
                positive.push(`Strukturierte Implementierung (${moduleDoc.classes.length} Klasse(n))`);
            }
        }
        
        if (negative.length === 0 && complexity !== 'simple') {
            negative.push('Keine bekannten signifikanten Nachteile');
        }
        
        // Limit based on complexity
        const maxPositive = complexity === 'simple' ? 2 : complexity === 'medium' ? 3 : positive.length;
        const maxNegative = complexity === 'simple' ? 1 : complexity === 'medium' ? 2 : negative.length;
        
        consequencesText += positive.slice(0, maxPositive).map(p => `- ${p}`).join('\n');
        consequencesText += '\n\n### Negative\n\n';
        if (maxNegative > 0) {
            consequencesText += negative.slice(0, maxNegative).map(n => `- ${n}`).join('\n');
        } else {
            consequencesText += '- Keine spezifischen Nachteile\n';
        }
        
        return consequencesText;
    }

    /**
     * Reconstructs Verweise section from dependencies and similar ADRs.
     */
    private reconstructVerweise(
        context: ModuleContext,
        similarAdrs: Array<{ adr: any; module: any; similarityScore: number }>
    ): string {
        const verweise: string[] = [];
        
        // Add similar ADRs
        if (similarAdrs.length > 0) {
            verweise.push('**Ähnliche ADRs:**');
            for (const similar of similarAdrs.slice(0, 3)) {
                verweise.push(`- ADR-${similar.adr.adr_number}: ${similar.adr.title} (\`${similar.module.file_path}\`)`);
            }
        }
        
        // Add dependencies
        if (context.dependencies.length > 0) {
            verweise.push('\n**Verwandte Module (Dependencies):**');
            const uniqueDeps = new Set(context.dependencies.map((d: any) => d.to_module || d.to));
            for (const dep of Array.from(uniqueDeps).slice(0, 10)) {
                verweise.push(`- \`${dep}\``);
            }
        }
        
        // Add incoming dependencies
        if (context.incomingDependencies.length > 0) {
            verweise.push('\n**Nutzer dieses Moduls:**');
            const uniqueUsers = new Set(context.incomingDependencies.map((d: any) => d.from_module || d.from));
            for (const user of Array.from(uniqueUsers).slice(0, 5)) {
                verweise.push(`- \`${user}\``);
            }
        }
        
        return verweise.length > 0 ? verweise.join('\n') : 'Keine Verweise verfügbar.';
    }

    /**
     * Reconstructs Implementation section for complex modules (similar to ADR-038).
     * Includes technical details, affected components, and implementation notes.
     */
    private reconstructImplementation(context: ModuleContext, reasoning: any = null): string {
        let implementationText = '## Implementierung\n\n';
        
        // Affected components
        const affectedComponents: string[] = [];
        affectedComponents.push(context.module.file_path);
        
        // Add ALL dependencies as affected components (no limit for complex modules)
        for (const dep of context.dependencies) {
            const depPath = typeof dep === 'string' ? dep : ((dep as any).to_module || (dep as any).to);
            if (depPath && !affectedComponents.includes(depPath)) {
                affectedComponents.push(depPath);
            }
        }
        
        if (affectedComponents.length > 0) {
            implementationText += '**Betroffene Komponenten:**\n';
            for (const component of affectedComponents) {
                implementationText += `- \`${component}\`\n`;
            }
            implementationText += '\n';
        }
        
        // Technical details
        implementationText += '**Technische Details:**\n\n';
        implementationText += `**Implementierung:**\n`;
        
        // Detect VS Code Runtime as incoming dependency if 'vscode' is imported
        let incomingDepsCount = context.incomingDependencies.length;
        const hasVscodeImport = context.dependencies.some((dep: any) => {
            const depPath = typeof dep === 'string' ? dep : ((dep as any).to_module || (dep as any).to);
            return depPath === 'vscode' || depPath?.includes('vscode');
        });
        if (hasVscodeImport && incomingDepsCount === 0) {
            incomingDepsCount = 1; // VS Code Runtime
        }
        
        // Extract symbol count from module documentation if not in DB
        let symbolCount = context.symbols.length;
        if (symbolCount === 0) {
            // Try to extract from module documentation
            const moduleDoc = this.parseModuleDocumentation(context.module.content_markdown);
            symbolCount = moduleDoc.classes.length + moduleDoc.keyFunctions.length;
        }
        
        // Add implementation details
        implementationText += `- Modul: \`${context.module.file_path}\`\n`;
        implementationText += `- Dependencies: ${context.dependencies.length} (ausgehend)\n`;
        if (hasVscodeImport && context.incomingDependencies.length === 0) {
            implementationText += `- Incoming Dependencies: ${incomingDepsCount} (VS Code Runtime)\n`;
        } else {
            implementationText += `- Incoming Dependencies: ${incomingDepsCount}\n`;
        }
        implementationText += `- Symbole: ${symbolCount}\n`;
        
        // Add pattern information
        if (context.patterns.length > 0) {
            const primaryPattern = context.patterns[0];
            implementationText += `- Pattern: ${primaryPattern.pattern} (${primaryPattern.confidence} confidence)\n`;
        }
        
        // Add architectural characteristics
        if (context.dependencies.length >= 20) {
            implementationText += `- God Object Pattern: ${context.dependencies.length} Dependencies (höchster Wert im System)\n`;
        }
        if (symbolCount >= 20) {
            implementationText += `- Hohe Symbol-Dichte: ${symbolCount} Symbole in einem Modul\n`;
        }
        if (incomingDepsCount >= 10) {
            implementationText += `- Single Point of Failure: ${incomingDepsCount} Module abhängig\n`;
        }
        
        implementationText += '\n';
        
        // Add architectural notes if available from reasoning
        if (reasoning && reasoning.decision) {
            implementationText += '**Architektur-Notizen:**\n';
            implementationText += `- ${reasoning.decision.split('\n')[0]}\n\n`;
        }
        
        return implementationText;
    }
    
    /**
     * Extracts title from module or similar ADRs.
     */
    private extractTitle(module: any, similarAdrs: Array<{ adr: any; module: any; similarityScore: number }>): string {
        // Try to extract from module markdown
        const moduleLines = module.content_markdown?.split('\n') || [];
        for (const line of moduleLines) {
            if (line.startsWith('# Modul:')) {
                const title = line.replace('# Modul:', '').trim();
                if (title) {
                    return title;
                }
            }
        }
        
        // Use similar ADR title as template
        if (similarAdrs.length > 0) {
            const similarTitle = similarAdrs[0].adr.title;
            const similarModule = similarAdrs[0].module;
            const targetModuleName = path.basename(module.file_path, path.extname(module.file_path));
            const similarModuleName = path.basename(similarModule.file_path, path.extname(similarModule.file_path));
            
            // Replace module name in title
            return similarTitle.replace(similarModuleName, targetModuleName);
        }
        
        // Fallback: Generate from file path
        const moduleName = path.basename(module.file_path, path.extname(module.file_path));
        const dirName = path.dirname(module.file_path).split('/').pop() || '';
        return `${dirName ? dirName + ' - ' : ''}${moduleName}`;
    }

    /**
     * Finds the next available ADR number.
     */
    private async findNextAdrNumber(pluginId: string): Promise<number> {
        const adrDir = path.join(this.workspaceRoot, 'docs', 'adr');
        
        if (!fs.existsSync(adrDir)) {
            return 1;
        }

        const files = fs.readdirSync(adrDir)
            .filter(file => file.endsWith('.md') && file.match(/^\d{3}-/))
            .map(file => {
                const match = file.match(/^(\d{3})-/);
                return match ? parseInt(match[1], 10) : 0;
            })
            .filter(num => num > 0);

        if (files.length === 0) {
            return 1;
        }

        return Math.max(...files) + 1;
    }

    /**
     * Formats ADR number with leading zeros.
     */
    private formatAdrNumber(num: number): string {
        return num.toString().padStart(3, '0');
    }

    /**
     * Generates a URL-friendly slug from file path.
     */
    private generateSlug(filePath: string): string {
        // Remove extension and path separators
        const baseName = path.basename(filePath, path.extname(filePath));
        const dirName = path.dirname(filePath).replace(/[\/\\]/g, '-');
        
        // Combine and sanitize
        const slug = dirName ? `${dirName}-${baseName}` : baseName;
        return slug
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
    }
}
