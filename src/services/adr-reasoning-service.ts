import OpenAI from 'openai';
import { ModuleContext } from './adr-context-builder';
import { Adr } from '../models/adr';
import { ArchitecturalPattern } from './semantic-pattern-matcher';
import * as path from 'path';

/**
 * ADR Reasoning result from LLM
 */
export interface AdrReasoning {
    problems: string[];
    decision: string;
    rationale: string;
    alternatives: string[];
    tradeoffs: {
        positive: string[];
        negative: string[];
    };
    refactoring_recommendations?: string[];
}

/**
 * Service for reconstructing "Why" (rationale) from module context using LLM.
 * Uses OpenAI API to generate structured reasoning about architectural decisions.
 */
export class AdrReasoningService {
    private openai: OpenAI | null = null;
    private readonly defaultModel: string = 'gpt-4o-mini';
    private readonly temperature: number = 0; // Deterministic output

    constructor(apiKey?: string) {
        if (apiKey) {
            this.openai = new OpenAI({ apiKey });
        } else {
            // Try to get from environment variable
            const envKey = process.env.OPENAI_API_KEY;
            if (envKey) {
                this.openai = new OpenAI({ apiKey: envKey });
            } else {
                console.warn('[AdrReasoningService] OpenAI API key not provided. LLM reasoning will not work.');
            }
        }
    }

    /**
     * Checks if LLM is available.
     */
    public isAvailable(): boolean {
        return this.openai !== null;
    }

    /**
     * Reconstructs complete reasoning (problems, decision, rationale, alternatives, trade-offs).
     */
    public async reconstructWhy(
        context: ModuleContext,
        similarAdrs: Adr[],
        patterns: ArchitecturalPattern[],
        complexity: 'simple' | 'medium' | 'complex' = 'complex'
    ): Promise<AdrReasoning> {
        if (!this.openai) {
            throw new Error('OpenAI API not configured. Set OPENAI_API_KEY environment variable.');
        }

        const prompt = this.buildReasoningPrompt(context, similarAdrs, patterns, complexity);
        
        try {
            const response = await this.openai.chat.completions.create({
                model: this.defaultModel,
                messages: [
                    {
                        role: 'system',
                        content: `Du bist ein Architektur-Analyst. Analysiere Module und rekonstruiere Architektur-Entscheidungen aus Code-Struktur, Dependencies und Patterns.

KRITISCH - Vermeide generische Aussagen:
❌ "Die Notwendigkeit, X zu implementieren"
❌ "Die Herausforderung, Y zu schaffen"
❌ "Die Anforderung, Z zu verwalten"
❌ "Ermöglicht eine..."
❌ "Bietet eine..."

✅ Stattdessen: Konkrete, spezifische Architektur-Gründe:
✅ "VS Code API erfordert activate() in extension.ts"
✅ "25 Dependencies wegen Feature-Orchestration bei Extension-Start"
✅ "DocumentationProvider implementiert TreeDataProvider für Sidebar"
✅ "Repository Pattern wegen konsistenter CRUD-Operationen über 5 Dimensionen"

Analysiere Code-Struktur, Dependencies und Patterns.
Sei SPEZIFISCH, nicht generisch.
Antworte IMMER im JSON-Format.`
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: this.temperature,
                response_format: { type: 'json_object' }
            });

            const content = response.choices[0]?.message?.content;
            if (!content) {
                throw new Error('Empty response from OpenAI API');
            }

            const reasoning = JSON.parse(content) as AdrReasoning;
            
            // Validate structure
            this.validateReasoning(reasoning);
            
            return reasoning;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error(`[AdrReasoningService] Failed to reconstruct reasoning: ${errorMsg}`);
            throw error;
        }
    }

    /**
     * Reconstructs problems that this module solves.
     */
    public async reconstructProblems(
        context: ModuleContext,
        similarAdrs: Adr[]
    ): Promise<string[]> {
        const reasoning = await this.reconstructWhy(context, similarAdrs, []);
        return reasoning.problems;
    }

    /**
     * Reconstructs decision with rationale.
     */
    public async reconstructDecision(
        context: ModuleContext,
        similarAdrs: Adr[],
        patterns: ArchitecturalPattern[]
    ): Promise<{ decision: string; rationale: string }> {
        const reasoning = await this.reconstructWhy(context, similarAdrs, patterns);
        return {
            decision: reasoning.decision,
            rationale: reasoning.rationale
        };
    }

    /**
     * Reconstructs alternatives that were considered.
     */
    public async reconstructAlternatives(
        context: ModuleContext,
        similarAdrs: Adr[]
    ): Promise<string[]> {
        const reasoning = await this.reconstructWhy(context, similarAdrs, []);
        return reasoning.alternatives;
    }

    /**
     * Builds structured prompt for reasoning.
     */
    private buildReasoningPrompt(
        context: ModuleContext,
        similarAdrs: Adr[],
        patterns: ArchitecturalPattern[],
        complexity: 'simple' | 'medium' | 'complex' = 'complex'
    ): string {
        const module = context.module;
        const moduleDoc = this.parseModuleDocumentation(module.content_markdown);
        const moduleName = path.basename(module.file_path, path.extname(module.file_path));
        const moduleDir = path.dirname(module.file_path);

        let prompt = `Analysiere das folgende Modul und rekonstruiere die Architektur-Entscheidungen.\n\n`;

        // Module information
        prompt += `## MODUL\n\n`;
        prompt += `- **Pfad:** \`${module.file_path}\`\n`;
        prompt += `- **Verzeichnis:** \`${moduleDir}\`\n`;
        prompt += `- **Dateiname:** \`${moduleName}\`\n\n`;

        // Classes (limit based on complexity)
        if (moduleDoc.classes.length > 0) {
            const maxClasses = complexity === 'simple' ? 2 : complexity === 'medium' ? 5 : 10;
            prompt += `**Klassen/Interfaces (${moduleDoc.classes.length}):**\n`;
            for (const cls of moduleDoc.classes.slice(0, maxClasses)) {
                prompt += `- \`${cls.name}\` (${cls.role || 'other'})`;
                if (cls.methodCount > 0 && complexity !== 'simple') {
                    prompt += ` - ${cls.methodCount} Methoden`;
                }
                prompt += `\n`;
            }
            prompt += `\n`;
        }

        // Key functions (limit based on complexity)
        if (moduleDoc.keyFunctions.length > 0) {
            const maxFunctions = complexity === 'simple' ? 3 : complexity === 'medium' ? 8 : 15;
            prompt += `**Hauptfunktionen (${moduleDoc.keyFunctions.length}):**\n`;
            for (const func of moduleDoc.keyFunctions.slice(0, maxFunctions)) {
                prompt += `- \`${func.name}()\``;
                if (func.role && complexity !== 'simple') {
                    prompt += ` (${func.role})`;
                }
                if (func.signature && complexity === 'complex') {
                    const sigPreview = func.signature.length > 100 ? func.signature.substring(0, 100) + '...' : func.signature;
                    prompt += `\n  Signatur: \`${sigPreview}\``;
                }
                prompt += `\n`;
            }
            prompt += `\n`;
        }

        // Dependencies - Group by category for later use
        const coreDeps: string[] = [];
        const apiDeps: string[] = [];
        const serviceDeps: string[] = [];
        const otherDeps: string[] = [];
        
        // Incoming dependencies - calculate early for use in multiple places
        const uniqueIncomingUsers = new Set(context.incomingDependencies.map((d: any) => d.from_module || d.from));
        
        if (context.dependencies.length > 0) {
            prompt += `**Dependencies (${context.dependencies.length}):**\n`;
            
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
            
            if (coreDeps.length > 0) {
                prompt += `- Core Dependencies (${coreDeps.length}): ${coreDeps.slice(0, 10).map(d => `\`${d}\``).join(', ')}\n`;
            }
            if (apiDeps.length > 0) {
                prompt += `- API Dependencies (${apiDeps.length}): ${apiDeps.slice(0, 10).map(d => `\`${d}\``).join(', ')}\n`;
            }
            if (serviceDeps.length > 0) {
                prompt += `- Service Dependencies (${serviceDeps.length}): ${serviceDeps.slice(0, 10).map(d => `\`${d}\``).join(', ')}\n`;
            }
            if (otherDeps.length > 0 && otherDeps.length <= 20) {
                prompt += `- Weitere Dependencies (${otherDeps.length}): ${otherDeps.slice(0, 10).map(d => `\`${d}\``).join(', ')}\n`;
            }
            prompt += `\n`;
        }

        // Incoming dependencies
        if (context.incomingDependencies.length > 0) {
            const uniqueUsers = new Set(context.incomingDependencies.map((d: any) => d.from_module || d.from));
            prompt += `**Wird genutzt von (${uniqueUsers.size} Modulen):**\n`;
            for (const user of Array.from(uniqueUsers).slice(0, 10)) {
                prompt += `- \`${user}\`\n`;
            }
            prompt += `\n`;
        }

        // Symbols
        if (context.symbols.length > 0) {
            const symbolKinds = new Map<string, number>();
            for (const symbol of context.symbols) {
                const kind = (symbol as any).kind || 'unknown';
                symbolKinds.set(kind, (symbolKinds.get(kind) || 0) + 1);
            }
            prompt += `**Symbole (${context.symbols.length}):**\n`;
            for (const [kind, count] of symbolKinds.entries()) {
                prompt += `- ${count} ${kind}\n`;
            }
            prompt += `\n`;
        }

        // Patterns
        if (patterns.length > 0) {
            prompt += `## ERKANNTE PATTERNS\n\n`;
            for (const pattern of patterns.slice(0, 5)) {
                prompt += `- **${pattern.pattern}** (${pattern.confidence} confidence)\n`;
                if (pattern.evidence.length > 0) {
                    prompt += `  Evidence: ${pattern.evidence.slice(0, 3).join(', ')}\n`;
                }
            }
            prompt += `\n`;
        }

        // Similar ADRs
        if (similarAdrs.length > 0) {
            prompt += `## ÄHNLICHE ADRs (als Vorlage)\n\n`;
            for (const adr of similarAdrs.slice(0, 3)) {
                prompt += `### ADR-${adr.adr_number}: ${adr.title}\n\n`;
                
                // Extract key sections
                const contextMatch = adr.content_markdown.match(/##\s+Kontext\s*\n([\s\S]*?)(?=##|$)/i);
                const decisionMatch = adr.content_markdown.match(/##\s+Entscheidung\s*\n([\s\S]*?)(?=##|$)/i);
                
                if (contextMatch) {
                    const contextPreview = contextMatch[1].substring(0, 500).trim();
                    prompt += `**Kontext:** ${contextPreview}...\n\n`;
                }
                
                if (decisionMatch) {
                    const decisionPreview = decisionMatch[1].substring(0, 500).trim();
                    prompt += `**Entscheidung:** ${decisionPreview}...\n\n`;
                }
            }
            prompt += `\n`;
        }

        // Step-by-step analysis
        prompt += `## ANALYSE-SCHRITTE\n\n`;
        prompt += `Gehe Schritt für Schritt vor:\n\n`;
        
        prompt += `**SCHRITT 1: Analysiere Dateiname und Pfad**\n`;
        prompt += `- Dateiname: \`${moduleName}\`\n`;
        prompt += `- Pfad: \`${moduleDir}\`\n`;
        prompt += `- Was sagt der Name über die Rolle?\n`;
        prompt += `  - "extension.ts" → VS Code Entry Point (activate/deactivate erforderlich)\n`;
        prompt += `  - "repository.ts" → Data Access Layer (CRUD-Operationen)\n`;
        prompt += `  - "service.ts" → Business Logic (Orchestration)\n`;
        prompt += `  - "api.ts" → Public Interface (Exports)\n\n`;
        
        prompt += `**SCHRITT 2: Analysiere Funktionen**\n`;
        const hasActivate = moduleDoc.keyFunctions.some(f => f.name.includes('activate'));
        const hasCreate = moduleDoc.keyFunctions.some(f => f.name.includes('create') || f.name.includes('Create'));
        const hasGet = moduleDoc.keyFunctions.some(f => f.name.includes('get') || f.name.includes('Get') || f.name.includes('find') || f.name.includes('Find'));
        
        if (hasActivate) {
            prompt += `- Gibt es activate/deactivate? → VS Code Entry Point Pattern\n`;
        }
        if (hasCreate && hasGet) {
            prompt += `- Gibt es create/read/update/delete? → Repository Pattern\n`;
        }
        prompt += `- Was ist die Kern-Funktionalität? (Orchestration, Data Access, UI, etc.)\n\n`;
        
        prompt += `**SCHRITT 3: Analysiere Dependencies**\n`;
        prompt += `- ${context.dependencies.length} Dependencies (ausgehend)\n`;
        prompt += `- Kategorien: ${coreDeps.length} Core, ${apiDeps.length} API, ${serviceDeps.length} Service\n`;
        
        // Calculate gap score (dependencies * 2 - adrs * 10, min 0)
        const gapScore = Math.max(0, context.dependencies.length * 2 - (similarAdrs.length * 10));
        
        if (context.dependencies.length > 20) {
            prompt += `- ⚠️ ${context.dependencies.length} Dependencies = GOD OBJECT ANTI-PATTERN!\n`;
            prompt += `  - Gap-Score: ${gapScore} (höchster Wert im System)\n`;
            prompt += `  - Erwähne dies explizit in "Negative Konsequenzen"\n`;
            prompt += `  - Refactoring-Schwelle: Bei >30 Dependencies Plugin-Architektur erwägen\n`;
        } else if (context.dependencies.length > 15) {
            prompt += `- ${context.dependencies.length} Dependencies → Feature-Orchestration bei Extension-Start\n`;
            prompt += `- Gap-Score: ${gapScore}\n`;
        } else if (context.dependencies.length > 5) {
            prompt += `- Moderate Anzahl → Fokussierte Funktionalität mit klaren Abhängigkeiten\n`;
        } else {
            prompt += `- Wenige Dependencies → Isolierte, fokussierte Funktionalität\n`;
        }
        
        // Incoming dependencies
        if (uniqueIncomingUsers.size > 0) {
            prompt += `- Wird genutzt von: ${uniqueIncomingUsers.size} anderen Modulen (eingehend)\n`;
            if (uniqueIncomingUsers.size > 10) {
                prompt += `  - ⚠️ ${uniqueIncomingUsers.size} Module = SINGLE POINT OF FAILURE!\n`;
                prompt += `  - Erwähne "zentrale Rolle" oder "hoher Impact bei Änderungen"\n`;
            } else if (uniqueIncomingUsers.size > 5) {
                prompt += `  - Zeigt zentrale Rolle im System\n`;
            }
        }
        prompt += `\n`;
        
        // Anti-Pattern recognition (skip for simple modules)
        if (complexity !== 'simple') {
            prompt += `**SCHRITT 4: Erkenne Anti-Patterns**\n`;
            if (context.dependencies.length > 20) {
                prompt += `- ⚠️ ${context.dependencies.length} Dependencies = God Object Anti-Pattern\n`;
                prompt += `  → Erwähne: "Bewusst akzeptiert wegen [Constraint], Refactoring-Schwelle: >30 Dependencies"\n`;
            }
            if (uniqueIncomingUsers.size > 10) {
                prompt += `- ⚠️ ${uniqueIncomingUsers.size} Module nutzen dieses = Single Point of Failure\n`;
                prompt += `  → Erwähne: "Zentrale Rolle, hoher Impact bei Änderungen"\n`;
            }
            if (moduleDoc.classes.length > 3) {
                prompt += `- ⚠️ ${moduleDoc.classes.length} Klassen in einem File = Multiple Responsibilities\n`;
                prompt += `  → Erwähne: "Extrahiere Klassen in separate Files empfohlen"\n`;
            }
            prompt += `\n`;
        }
        
        prompt += `**SCHRITT 5: Formuliere Probleme basierend auf Analyse**\n`;
        prompt += `- NICHT: "Die Notwendigkeit, X zu tun" oder "X um Y zu ermöglichen"\n`;
        prompt += `- SONDERN: "Framework erfordert X", "System benötigt Y wegen Z"\n`;
        prompt += `- KEINE generischen Endungen:\n`;
        prompt += `  ❌ "um die Funktionalität zu gewährleisten"\n`;
        prompt += `  ❌ "um eine vollständige Integration zu ermöglichen"\n`;
        prompt += `  ❌ "um die Funktionalität bereitzustellen"\n`;
        prompt += `  ❌ "um die Verwaltung zu ermöglichen"\n`;
        prompt += `  ❌ "um die Bereitstellung zu gewährleisten"\n`;
        prompt += `  ❌ "um die Integration zu ermöglichen"\n`;
        prompt += `- PROBLEME SIND KURZ UND PRÄZISE: Maximal 1 Satz, KEINE Erklärungen, KEINE "um...zu"-Konstruktionen\n`;
        prompt += `- PROBLEME ENDEN MIT PUNKT, NICHT MIT "um...zu"-Phrasen\n`;
        
        // Check for multiple main decisions
        const hasActivateAndProvider = hasActivate && moduleDoc.classes.some(c => c.name.includes('Provider'));
        if (hasActivateAndProvider) {
            prompt += `- ⚠️ WICHTIG: Dieses Modul hat MEHRERE Hauptentscheidungen:\n`;
            prompt += `  - Hauptentscheidung 1: VS Code Entry Point (activate/deactivate)\n`;
            prompt += `  - Hauptentscheidung 2: DocumentationProvider (Tree View)\n`;
            prompt += `  → Erwähne beide getrennt in "Entscheidung"\n`;
            prompt += `  → Problem: Beide in einem File = God Object\n`;
        }
        prompt += `\n`;

        // Few-shot learning examples
        prompt += `## BEISPIELE FÜR GUTE VS. SCHLECHTE ANALYSE\n\n`;
        
        prompt += `### Beispiel 1: extension.ts (Entry Point)\n\n`;
        prompt += `✅ GUTE Probleme (KURZ, PRÄZISE, KEINE generischen Endungen):\n`;
        prompt += `- "VS Code Extension benötigt Entry Point (extension.ts mit activate/deactivate)"\n`;
        prompt += `- "Alle Commands müssen bei Extension-Start registriert werden"\n`;
        prompt += `- "Extension braucht Sidebar Tree View für Dokumentations-Navigation"\n`;
        prompt += `- "${context.dependencies.length} Features müssen bei Extension-Start orchestriert werden"\n`;
        prompt += `- "VS Code API erfordert activate() in extension.ts"\n\n`;
        prompt += `❌ SCHLECHTE Probleme (mit generischen Endungen - VERBOTEN!):\n`;
        prompt += `- "Alle Commands müssen bei Extension-Start registriert werden, um die Funktionalität zu gewährleisten"\n`;
        prompt += `- "Alle Commands müssen bei Extension-Start registriert werden, um die Funktionalität bereitzustellen"\n`;
        prompt += `- "${context.dependencies.length} Features müssen orchestriert werden, um eine vollständige Integration zu ermöglichen"\n`;
        prompt += `- "Extension benötigt Sidebar, um die Navigation zu ermöglichen"\n\n`;
        prompt += `⚠️ REGEL: Wenn ein Problem mit "um...zu" endet, ist es VERBOTEN!\n`;
        prompt += `→ Entferne die "um...zu"-Phrase komplett oder formuliere um\n\n`;
        prompt += `❌ SCHLECHTE (zu generische) Probleme:\n`;
        prompt += `- "Die Notwendigkeit, Dokumentationsdateien zu verwalten"\n`;
        prompt += `- "Die Herausforderung, eine benutzerfreundliche Schnittstelle zu schaffen"\n`;
        prompt += `- "Die Anforderung, Umgebungsvariablen zu laden"\n\n`;
        
        prompt += `✅ GUTE Entscheidung:\n`;
        prompt += `"VS Code Entry Point Pattern mit zentraler Feature-Registrierung wurde gewählt weil VS Code API activate() in extension.ts erfordert. ${context.dependencies.length} Dependencies zeigen vollständige Feature-Orchestration bei Extension-Start."\n\n`;
        
        prompt += `### Beispiel 2: repository.ts (Data Access)\n\n`;
        prompt += `✅ GUTE Probleme:\n`;
        prompt += `- "Konsistente CRUD-Operationen über 5 Dimensionen erforderlich"\n`;
        prompt += `- "Dimension-spezifische Queries (Module nach file_path, Symbols nach symbol_id)"\n`;
        prompt += `- "Type-Safety ohne any für alle Dimensionen"\n\n`;
        prompt += `❌ SCHLECHTE Probleme:\n`;
        prompt += `- "Die Notwendigkeit, Daten zu speichern"\n`;
        prompt += `- "Die Herausforderung, Datenbank-Zugriff zu implementieren"\n\n`;

        // Requirements section
        prompt += `## ANFORDERUNGEN AN DIE ANTWORT\n\n`;
        
        prompt += `1. **Probleme müssen konkret sein:**\n`;
        prompt += `   ✅ "VS Code API erfordert activate() in extension.ts"\n`;
        prompt += `   ❌ "Die Notwendigkeit, Features zu verwalten"\n\n`;
        
        prompt += `2. **Anti-Patterns explizit benennen:**\n`;
        if (context.dependencies.length > 20) {
            prompt += `   ⚠️ ${context.dependencies.length} Dependencies = God Object Anti-Pattern!\n`;
            prompt += `   → Erwähne dies explizit in "Negative Konsequenzen"\n`;
            prompt += `   → Format: "${context.dependencies.length} Dependencies = höchster Wert im System (Gap-Score: ${gapScore})"\n`;
        }
        if (uniqueIncomingUsers.size > 10) {
            prompt += `   ⚠️ ${uniqueIncomingUsers.size} Module nutzen dieses = Single Point of Failure!\n`;
            prompt += `   → Erwähne dies explizit in "Negative Konsequenzen"\n`;
        }
        if (moduleDoc.classes.length > 3) {
            prompt += `   ⚠️ ${moduleDoc.classes.length} Klassen in einem File = Multiple Responsibilities\n`;
            prompt += `   → Erwähne: "Extrahiere Klassen in separate Files empfohlen"\n`;
        }
        prompt += `\n`;
        
        prompt += `3. **Messbare Fakten nutzen:**\n`;
        prompt += `   ✅ "${context.dependencies.length} Dependencies = höchster Wert im System (Gap-Score: ${gapScore})"\n`;
        prompt += `   ✅ "Schwer zu testen (${context.dependencies.length} Mocks nötig für Unit-Tests)"\n`;
        prompt += `   ✅ "Änderungen haben system-weiten Impact (${uniqueIncomingUsers.size} Module betroffen)"\n`;
        prompt += `   ❌ "Kann zu Komplexität führen" (zu vage)\n`;
        prompt += `   ❌ "Schwierig zu warten" (zu vage)\n\n`;
        
        prompt += `4. **Zentrale Rolle erwähnen:**\n`;
        if (uniqueIncomingUsers.size > 0) {
            prompt += `   → ${uniqueIncomingUsers.size} Module nutzen dieses Modul\n`;
            prompt += `   → Erwähne "zentrale Rolle" oder "hoher Impact bei Änderungen" in Konsequenzen\n`;
        }
        prompt += `\n`;
        
        prompt += `5. **Refactoring-Empfehlungen:**\n`;
        if (context.dependencies.length > 20) {
            prompt += `   → Bei ${context.dependencies.length} Dependencies: Empfehle Refactoring\n`;
            if (hasActivateAndProvider) {
                prompt += `   → Konkrete Schritte: "Extrahiere DocumentationProvider in separates File"\n`;
            }
            if (context.dependencies.length > 30) {
                prompt += `   → "Plugin-Architektur dringend empfohlen (${context.dependencies.length} > 30)"\n`;
            } else {
                prompt += `   → "FeatureRegistry Pattern für Command-Registrierung"\n`;
            }
        }
        if (moduleDoc.classes.length > 3) {
            prompt += `   → "Extrahiere ${moduleDoc.classes.length} Klassen in separate Files"\n`;
        }
        prompt += `\n`;

        // Task (simplified for simple modules)
        prompt += `## AUFGABE\n\n`;
        prompt += `Rekonstruiere die Architektur-Entscheidungen für dieses Modul:\n\n`;
        
        if (complexity === 'simple') {
            prompt += `1. **Probleme:** Maximal 1-2 konkrete Architektur-Anforderungen (KURZ, PRÄZISE, KEINE generischen Endungen)\n`;
        } else if (complexity === 'medium') {
            prompt += `1. **Probleme:** 2-3 konkrete Architektur-Anforderungen (KURZ, PRÄZISE, KEINE generischen Endungen)\n`;
        } else {
            prompt += `1. **Probleme:** Welche konkreten Architektur-Anforderungen führten zu diesem Modul?\n`;
        }
        prompt += `   
   Analysiere: Dateiname (\`${moduleName}\`), Funktionen (${moduleDoc.keyFunctions.length}), Dependencies (${context.dependencies.length})\n`;
        prompt += `   
   Formuliere wie in den Beispielen: Spezifisch, nicht generisch!\n`;
        prompt += `   
   ⚠️ KRITISCH: KEINE "um...zu"-Konstruktionen am Ende!\n`;
        prompt += `   ❌ FALSCH: "X muss Y tun, um die Funktionalität zu gewährleisten"\n`;
        prompt += `   ✅ RICHTIG: "X muss Y tun" (Ende mit Punkt, keine Erklärung)\n\n`;
        prompt += `2. **Entscheidung:** Wie wurde es implementiert und WARUM?\n`;
        if (complexity === 'simple') {
            prompt += `   - KURZE Begründung (1-2 Sätze): Nutze Dateiname und Hauptfunktion\n`;
            prompt += `   - Beispiel: "Git-Funktionen wurden implementiert weil System geänderte Dateien überwachen muss"\n`;
        } else if (hasActivateAndProvider) {
            prompt += `   - WICHTIG: Dieses Modul hat MEHRERE Hauptentscheidungen - erwähne beide getrennt:\n`;
            prompt += `     - Hauptentscheidung 1: VS Code Entry Point (activate/deactivate)\n`;
            prompt += `     - Hauptentscheidung 2: DocumentationProvider (Tree View)\n`;
            prompt += `   - Problem: Beide in einem File = God Object\n`;
        } else {
            prompt += `   - Nutze Dateiname, Funktionen, Dependencies für konkrete Begründung\n`;
            prompt += `   - Nicht: "Das Modul implementiert eine Klasse..."\n`;
            prompt += `   - Sondern: "VS Code Entry Point Pattern wurde gewählt weil VS Code API activate() erfordert"\n`;
        }
        prompt += `\n`;
        prompt += `3. **Rationale:** Warum wurde diese spezifische Struktur gewählt?\n`;
        if (complexity === 'simple') {
            prompt += `   - KURZE Begründung (1 Satz): Konkreter technischer Grund\n`;
        } else {
            prompt += `   - Begründung aus Code-Struktur, Dependencies, Patterns\n`;
            prompt += `   - Konkrete technische Gründe, nicht generische Aussagen\n`;
        }
        prompt += `\n`;
        
        if (complexity === 'simple') {
            prompt += `4. **Alternativen:** Optional - nur wenn es eine offensichtliche Alternative gibt (max. 1)\n`;
        } else if (complexity === 'medium') {
            prompt += `4. **Alternativen:** 1-2 Alternativen, die erwogen wurden\n`;
            prompt += `   - Format: "Alternative X: Beschreibung → Abgelehnt weil: konkreter Grund"\n`;
        } else {
            prompt += `4. **Alternativen:** Welche Alternativen wurden erwogen?\n`;
            prompt += `   - Basierend auf Patterns (z.B. Repository vs. Direct DB Access)\n`;
            prompt += `   - Für extension.ts: Lazy Loading vs. Eager Loading, Plugin-Architektur vs. Monolith\n`;
            prompt += `   - Format: "Alternative X: Beschreibung → Abgelehnt weil: konkreter Grund"\n`;
            prompt += `   - Beispiel: "Lazy Loading: Features bei Bedarf laden → Abgelehnt: Verschlechtert UX, Features nicht sofort verfügbar"\n`;
        }
        prompt += `\n`;
        
        if (complexity === 'simple') {
            prompt += `5. **Trade-offs:** Maximal 1-2 positive, 0-1 negative Konsequenzen (KURZ)\n`;
        } else if (complexity === 'medium') {
            prompt += `5. **Trade-offs:** 2-3 positive, 1-2 negative Konsequenzen\n`;
        } else {
            prompt += `5. **Trade-offs:** Was sind die Vor- und Nachteile?\n`;
            prompt += `   - Nutze MESSBARE FAKTEN:\n`;
            prompt += `     ✅ "${context.dependencies.length} Dependencies = höchster Wert im System (Gap-Score: ${gapScore})"\n`;
            prompt += `     ✅ "Schwer zu testen (${context.dependencies.length} Mocks nötig)"\n`;
            if (uniqueIncomingUsers.size > 0) {
                prompt += `     ✅ "Single Point of Failure (${uniqueIncomingUsers.size} Module betroffen bei Fehler)"\n`;
            }
            prompt += `     ✅ "Extension startet nicht bei Fehler in diesem Modul"\n`;
        }
        prompt += `   - NICHT: "Kann zu Komplexität führen" (zu vage)\n`;
        
        // Refactoring recommendations (skip for simple modules)
        if (complexity !== 'simple') {
            if (complexity === 'medium') {
                prompt += `\n6. **Refactoring-Empfehlungen:** Optional - max. 1-2 konkrete Empfehlungen\n`;
            } else {
                prompt += `\n6. **Refactoring-Empfehlungen:** Konkrete Empfehlungen basierend auf Anti-Patterns\n`;
                if (context.dependencies.length > 20) {
                    prompt += `   - Bei ${context.dependencies.length} Dependencies: Empfehle Refactoring\n`;
                    if (hasActivateAndProvider) {
                        prompt += `   - Konkrete Schritte: "Extrahiere DocumentationProvider in separates File"\n`;
                    }
                    if (context.dependencies.length > 30) {
                        prompt += `   - "Plugin-Architektur dringend empfohlen (${context.dependencies.length} > 30)"\n`;
                    } else {
                        prompt += `   - "FeatureRegistry Pattern für Command-Registrierung"\n`;
                    }
                }
                if (moduleDoc.classes.length > 3) {
                    prompt += `   - "Extrahiere ${moduleDoc.classes.length} Klassen in separate Files"\n`;
                }
            }
        }
        prompt += `\n`;

        // Response format (simplified for simple modules)
        prompt += `## ANTWORT-FORMAT (JSON)\n\n`;
        prompt += `Antworte IMMER im folgenden JSON-Format:\n\n`;
        prompt += `{\n`;
        if (complexity === 'simple') {
            prompt += `  "problems": ["Problem 1", "Problem 2"],  // Maximal 2 Probleme\n`;
            prompt += `  "decision": "Kurze Entscheidung (1-2 Sätze)",\n`;
            prompt += `  "rationale": "Kurze Begründung (1 Satz)",\n`;
            prompt += `  "alternatives": [],  // Optional - max. 1 Alternative\n`;
            prompt += `  "tradeoffs": {\n`;
            prompt += `    "positive": ["Vorteil 1", "Vorteil 2"],  // Maximal 2\n`;
            prompt += `    "negative": []  // Optional - max. 1\n`;
            prompt += `  }\n`;
            prompt += `  // KEINE refactoring_recommendations für einfache Module!\n`;
        } else if (complexity === 'medium') {
            prompt += `  "problems": ["Problem 1", "Problem 2", "Problem 3"],  // 2-3 Probleme\n`;
            prompt += `  "decision": "Entscheidung mit Begründung (2-3 Sätze)",\n`;
            prompt += `  "rationale": "Begründung basierend auf Code-Struktur und Dependencies",\n`;
            prompt += `  "alternatives": ["Alternative 1", "Alternative 2"],  // 1-2 Alternativen\n`;
            prompt += `  "tradeoffs": {\n`;
            prompt += `    "positive": ["Vorteil 1", "Vorteil 2", "Vorteil 3"],  // 2-3\n`;
            prompt += `    "negative": ["Nachteil 1", "Nachteil 2"]  // 1-2\n`;
            prompt += `  },\n`;
            prompt += `  "refactoring_recommendations": []  // Optional - max. 1-2\n`;
        } else {
            prompt += `  "problems": ["Problem 1", "Problem 2", ...],\n`;
            prompt += `  "decision": "Entscheidung mit detaillierter Begründung",\n`;
            prompt += `  "rationale": "Warum wurde diese Entscheidung getroffen? Detaillierte Erklärung basierend auf Code-Struktur, Dependencies und Patterns.",\n`;
            prompt += `  "alternatives": ["Alternative 1", "Alternative 2", ...],\n`;
            prompt += `  "tradeoffs": {\n`;
            prompt += `    "positive": ["Vorteil 1", "Vorteil 2", ...],\n`;
            prompt += `    "negative": ["Nachteil 1", "Nachteil 2", ...]\n`;
            prompt += `  },\n`;
            prompt += `  "refactoring_recommendations": ["Empfehlung 1", "Empfehlung 2", ...]\n`;
        }
        prompt += `}\n\n`;
        
        // Refactoring recommendations (only for complex modules)
        if (complexity === 'complex') {
            prompt += `**WICHTIG - Refactoring-Empfehlungen:**\n`;
            if (context.dependencies.length > 20) {
                prompt += `- Bei ${context.dependencies.length} Dependencies: Konkrete Refactoring-Schritte angeben\n`;
            }
            if (hasActivateAndProvider) {
                prompt += `- Extrahiere DocumentationProvider in separates File\n`;
            }
            if (context.dependencies.length > 30) {
                prompt += `- Plugin-Architektur dringend empfohlen\n`;
            }
            prompt += `\n`;
        }

        prompt += `**WICHTIG:**\n`;
        prompt += `- Alle Antworten müssen auf den bereitgestellten Daten basieren\n`;
        prompt += `- Nutze ähnliche ADRs als Vorlage für Struktur und Stil\n`;
        prompt += `- Erkläre das "Warum" detailliert, nicht nur das "Was"\n`;
        prompt += `- Sei spezifisch und konkret, nicht generisch\n`;
        prompt += `- VERMEIDE: "Die Notwendigkeit...", "Die Herausforderung...", "Die Anforderung..."\n`;
        prompt += `- STATTDESSEN: "Framework erfordert...", "System benötigt... wegen...", "API erfordert..."\n`;

        return prompt;
    }

    /**
     * Parses module documentation markdown to extract structured information.
     */
    private parseModuleDocumentation(content: string): {
        classes: Array<{ name: string; role: string | null; methodCount: number }>;
        keyFunctions: Array<{ name: string; role: string | null; signature: string | null }>;
    } {
        const lines = content.split('\n');
        const result = {
            classes: [] as Array<{ name: string; role: string | null; methodCount: number }>,
            keyFunctions: [] as Array<{ name: string; role: string | null; signature: string | null }>
        };
        
        let currentClass: { name: string; role: string | null; methodCount: number } | null = null;
        let methodCount = 0;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
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
     * Validates reasoning structure and checks for generic phrases.
     */
    private validateReasoning(reasoning: any): void {
        if (!reasoning.problems || !Array.isArray(reasoning.problems)) {
            throw new Error('Invalid reasoning: problems must be an array');
        }
        if (!reasoning.decision || typeof reasoning.decision !== 'string') {
            throw new Error('Invalid reasoning: decision must be a string');
        }
        if (!reasoning.rationale || typeof reasoning.rationale !== 'string') {
            throw new Error('Invalid reasoning: rationale must be a string');
        }
        if (!reasoning.alternatives || !Array.isArray(reasoning.alternatives)) {
            throw new Error('Invalid reasoning: alternatives must be an array');
        }
        if (!reasoning.tradeoffs || typeof reasoning.tradeoffs !== 'object') {
            throw new Error('Invalid reasoning: tradeoffs must be an object');
        }
        if (!reasoning.tradeoffs.positive || !Array.isArray(reasoning.tradeoffs.positive)) {
            throw new Error('Invalid reasoning: tradeoffs.positive must be an array');
        }
        if (!reasoning.tradeoffs.negative || !Array.isArray(reasoning.tradeoffs.negative)) {
            throw new Error('Invalid reasoning: tradeoffs.negative must be an array');
        }
        
        // Refactoring recommendations are optional
        if (reasoning.refactoring_recommendations && !Array.isArray(reasoning.refactoring_recommendations)) {
            throw new Error('Invalid reasoning: refactoring_recommendations must be an array if provided');
        }
        
        // Check for generic phrases
        const genericPhrases = [
            'die notwendigkeit',
            'die herausforderung',
            'die anforderung',
            'ermöglicht eine',
            'bietet eine',
            'schafft eine',
            'stellt eine',
            'um die funktionalität',
            'um eine vollständige',
            'um die integration',
            'um die verwaltung',
            'um die bereitstellung',
            'um die navigation',
            'um die verfügbarkeit',
            'um die gewährleistung',
            'um die bereitstellung',
            'um die verwaltung',
            'um die integration',
            'um die funktionalität bereitzustellen',
            'um die funktionalität zu gewährleisten',
            'um die funktionalität zu ermöglichen'
        ];
        
        let hasGenericPhrases = false;
        
        // Check problems - stricter validation
        for (const problem of reasoning.problems) {
            const lower = problem.toLowerCase().trim();
            
            // Check for "um...zu" constructions (very common generic ending)
            if (lower.match(/um\s+(die|eine|der|das)\s+\w+\s+zu\s+\w+/)) {
                console.warn(`[AdrReasoningService] Warning: Generic "um...zu" construction detected in problem: "${problem.substring(0, 100)}..."`);
                hasGenericPhrases = true;
            }
            
            // Check for other generic phrases
            for (const phrase of genericPhrases) {
                if (lower.includes(phrase)) {
                    console.warn(`[AdrReasoningService] Warning: Generic phrase "${phrase}" detected in problem: "${problem.substring(0, 100)}..."`);
                    hasGenericPhrases = true;
                }
            }
        }
        
        // Check decision
        const decisionLower = reasoning.decision.toLowerCase();
        for (const phrase of genericPhrases) {
            if (decisionLower.includes(phrase)) {
                console.warn(`[AdrReasoningService] Warning: Generic phrase "${phrase}" detected in decision`);
                hasGenericPhrases = true;
            }
        }
        
        if (hasGenericPhrases) {
            console.warn(`[AdrReasoningService] Warning: Generic phrases detected. Consider regenerating with more specific instructions.`);
        }
    }
}

