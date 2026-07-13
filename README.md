# 5D Database Plugin + Semantic Brain

**Semantic Brain für LLM-Agenten** - Eine intelligente Wissensbasis, die es AI-Agenten ermöglicht, Code-Systeme zu verstehen, **OHNE dass sie diese vorher kennen müssen**.

VS Code Extension für 5-dimensionale Datenbank-Speicherung der Dokumentations-System-Daten mit semantischer Suche.

## ⚠️ WICHTIG: System-Kopplung

**Das Documentation System Plugin (Noyrax) und das 5D Database Plugin MÜSSEN gekoppelt werden - sie funktionieren nur gemeinsam!**

```
Noyrax (Documentation System) → generiert docs/ → 5D Database Plugin → SQLite-DBs → MCP-Server → LLM-Agenten
```

- **Noyrax** generiert die `docs/` Ordnerstruktur mit allen 5 Dimensionen
- **5D Database Plugin** liest `docs/` und speichert die Daten in SQLite-Datenbanken
- **MCP-Server** ermöglicht LLM-Agenten-Zugriff auf die Datenbanken

### Monorepo-Integration

In diesem Workspace sind beide Plugins als Monorepo integriert:
- `documentation-system-plugin/` - Noyrax Documentation System Plugin
- `5d-database-plugin/` - 5D Database Plugin
- `docs/` - Gemeinsam genutzte Dokumentation

Siehe `SETUP_NEW_PROJECT.md` für vollständigen Setup-Workflow.

## Übersicht

Das 5D Database Plugin speichert die 5 Dimensionen des Documentation System Plugins in separaten SQLite-Datenbanken:

- **X-Dimension (Modules)**: Modul-Dokumentation aus `docs/modules/*.md`
- **Y-Dimension (Symbols)**: Symbol-Index aus `docs/index/symbols.jsonl`
- **Z-Dimension (Dependencies)**: Dependency-Graph aus `docs/system/DEPENDENCY_GRAPH.md`
- **W-Dimension (ADRs)**: Architecture Decision Records aus `docs/adr/*.md`
- **T-Dimension (Changes)**: Change Reports aus `docs/system/CHANGE_REPORT.md`

## Features

- **5 separate SQLite-Datenbanken** - Eine pro Dimension für optimale Performance
- **Hash-basierte Änderungserkennung** - Inkrementelle Updates nur bei Änderungen
- **Cross-Dimension-Queries** - Verknüpfungen zwischen Dimensionen
- **MCP-Server Integration** - Systemweiter Zugriff via Model Context Protocol
- **VS Code UI** - Database Explorer und Status Bar Integration
- **Monorepo-Integration** - Noyrax und 5D Database Plugin im gleichen Workspace
- **Workflow-Orchestrierung** - Vollständiger Workflow (Generate Docs → Ingest → Embeddings)

## Installation

### Via npm (Recommended for CLI Tools)

```bash
npm install -g @noyrax/5d-database-plugin
```

**Available CLI Tools:**
- `noyrax-5d-database` - Ingest documentation
- `noyrax-5d-database-query` - Query database
- `noyrax-5d-database-tool` - Use MCP tools directly
- `noyrax-5d-database-search` - Semantic search
- `noyrax-5d-database-embedding` - Generate embeddings

**Example:**
```bash
# Ingest documentation
noyrax-5d-database ingest /path/to/workspace

# Query modules
noyrax-5d-database-query /path/to/workspace modules src/api/user-service.ts

# Semantic search
noyrax-5d-database-tool /path/to/workspace semantic_discovery "How does authentication work?" 5
```

### Via VS Code Extension

⚠️ **Voraussetzung: Documentation System Plugin (Noyrax) muss installiert sein und `docs/` generiert haben!**

1. **Documentation System Plugin (Noyrax) installieren** und `docs/` generieren
2. **5D Database Plugin installieren:**
   ```bash
   code --install-extension 5d-database-plugin-0.1.0.vsix
   ```
3. **Workspace öffnen** (muss `docs/` enthalten)
4. **Extension aktiviert sich automatisch** beim Start
5. **Ingestion ausführen:** `Ctrl+Shift+P` → "Ingest Documentation"

Siehe `SETUP_NEW_PROJECT.md` für vollständige Anleitung mit beiden Plugins.

## Verwendung

### Ingestion

Die Dokumentation wird automatisch beim ersten Start oder manuell via Command ingestiert:

- **Command**: `5d-database.ingest` - Ingestiert alle Dimensionen
- **CLI**: `node out/cli/ingest-cli.js <workspace-root> [--full]`
- **npm**: `noyrax-5d-database ingest <workspace-root> [--full]`

### CLI-Tools für direkten Zugriff

Für AI-Agenten und Entwickler stehen CLI-Tools für direkten Datenbank-Zugriff zur Verfügung:

- **Ingest-CLI**: `noyrax-5d-database ingest` - Vollständige Ingestion (5D + V-Dimension)
- **Embedding-CLI**: `noyrax-5d-database-embedding` - Embedding-Pipeline manuell ausführen (nur V-Dimension)
- **Query-CLI**: `noyrax-5d-database-query` - Datenbank-Queries (Modules, Symbols, Dependencies, ADRs, Changes)
- **Tool-CLI**: `noyrax-5d-database-tool` - MCP-Tools direkt nutzen (bootstrap, semantic_discovery, system_explanation, learning_path, cross_analysis, gap_analysis, architecture_mining)
- **Search-CLI**: `noyrax-5d-database-search` - Semantic Search über V-Dimension
- **MCP-Server**: `noyrax-5d-database-mcp` - MCP-Server für externe LLM-Agenten

**Hinweis:** Die Embedding-Pipeline wird automatisch bei der Ingestion ausgeführt, kann aber auch manuell via `noyrax-5d-database-embedding` ausgeführt werden (z.B. wenn ChromaDB nachträglich gestartet wurde).

### Environment Variables

Das System nutzt folgende Environment Variables (können in `.env` Datei oder als System-Environment-Variablen gesetzt werden):

- **`OPENAI_API_KEY`** (erforderlich für Embeddings):
  - API-Key für OpenAI (für Embedding-Generierung und optional Summarization)
  - Wird automatisch aus `.env` Datei geladen
  - Beispiel: `OPENAI_API_KEY=sk-...`

- **`EMBEDDING_STRATEGY`** (optional, default: `optimize`):
  - Strategie für große Module-Dokumentationen (>8000 Tokens)
  - Mögliche Werte:
    - `optimize` (default): Intelligente Kürzung - behält Struktur, entfernt Details
    - `hierarchical`: Nur Struktur (Header, Namen, Signaturen) - Details in Y-Dimension
    - `summarize`: LLM-basierte Summarization (erfordert `OPENAI_API_KEY`)
  - Beispiel: `EMBEDDING_STRATEGY=summarize`

**Token-Limit-Handling:**
- OpenAI text-embedding-3-small hat ein Context-Length-Limit von 8192 Tokens
- Große Module-Dokumentationen werden automatisch erkannt (>8000 Tokens)
- Die gewählte Strategie wird automatisch angewendet
- Bei Summarization-Fehlern: Automatischer Fallback auf Optimize-Strategie

Siehe `docs/adr/021-embedding-system-generator-pipeline.md` für Details zu den Strategien.

**Gap Analysis Tool:**

Das `gap_analysis` Tool identifiziert systematisch Dokumentationslücken:

```bash
# Finde Module mit vielen Dependencies aber ohne/wenigen ADRs
noyrax-5d-database-tool <workspace-root> gap_analysis

# Mit Parametern
noyrax-5d-database-tool <workspace-root> gap_analysis --min-deps 5 --limit 20
```

Das Tool analysiert alle Module, berechnet Gap-Scores basierend auf Dependency-Count und ADR-Count, und gibt priorisierte Empfehlungen zurück. Siehe `docs/adr/034-gap-analysis-tool.md` für Details.

**Architecture Mining Tool:**

Das `architecture_mining` Tool leitet rückwirkend Architektur-Entscheidungen aus dem Code ab:

```bash
# Analysiere gesamtes System für Architektur-Patterns
noyrax-5d-database-tool <workspace-root> architecture_mining

# Analysiere spezifische Datei
noyrax-5d-database-tool <workspace-root> architecture_mining <filePath>
```

Das Tool nutzt die **5D-Datenbanken (Semantic Brain)** - nicht den Code direkt:
- **X-Dimension (Modules)**: Modul-Pfade, Dateinamen, Struktur
- **Y-Dimension (Symbols)**: Symbol-Namen, Klassen-Namen
- **Z-Dimension (Dependencies)**: Dependency-Graph
- **W-Dimension (ADRs)**: Bestehende ADRs zum Vergleich

Es erkennt Patterns wie Repository Pattern, API Layer, Builder Pattern, Factory Pattern, Service Layer und Layered Architecture. Siehe `docs/adr/035-architecture-mining-tool.md` für Details.

Siehe `MCP_SERVER_SETUP.md` für detaillierte Anleitung.

### MCP-Server (für LLM-Agenten)

Der MCP-Server bietet Zugriff auf alle Dimensionen via Model Context Protocol:

- **Resources**: `db://modules/{pluginId}`, `db://symbols/{pluginId}`, etc.
- **Tools**: 
  - `bootstrap` - First-Contact für Agenten ohne Vorwissen
  - `semantic_discovery` - Semantic Search in natürlicher Sprache
  - `system_explanation` - System-Übersicht, Entry Points, Architecture ADRs
  - `learning_path` - Geführte Lernpfade
  - `query_modules`, `query_symbols`, `query_dependencies`, `cross_analysis`
  - `gap_analysis` - Systematische Dokumentationslücken-Identifikation
  - `architecture_mining` - Rückwirkende Architektur-Entscheidungs-Erkennung aus Code
  - `generate_documentation` - Dokumentation generieren (Noyrax-Integration)
  - `check_docs_status` - Prüft ob docs/ existiert und aktuell ist

Siehe `MCP_SERVER_SETUP.md` für detaillierte Setup-Anleitung für LLM-Agenten.

### Database Explorer

Der Database Explorer zeigt alle 5 Dimensionen in der VS Code Sidebar:
- X: Modules
- Y: Symbols
- Z: Dependencies
- W: ADRs
- T: Changes

## Architektur

### Datenbank-Schema

Jede Dimension hat ihre eigene SQLite-Datenbank:
- `{workspace}/.database-plugin/modules.db` - X-Dimension
- `{workspace}/.database-plugin/symbols.db` - Y-Dimension
- `{workspace}/.database-plugin/dependencies.db` - Z-Dimension
- `{workspace}/.database-plugin/adrs.db` - W-Dimension
- `{workspace}/.database-plugin/changes.db` - T-Dimension
- `{workspace}/.database-plugin/vectors.db` - V-Dimension (Embeddings für Semantic Search)

### ID-Strategie

- **Internal IDs**: UUID v4 für Primärschlüssel
- **External IDs**: Fachliche IDs (symbol_id, adr_number, etc.)
- **ID-Mapping**: Tabellen für External-ID → Internal-ID Übersetzung

### Cross-Dimension-Referenzen

- Symbol-ID → Modul-ID Auflösung
- ADR → File-Path Verknüpfungen
- Dependency → Symbol Evidence Links

## Entwicklung

### Build

```bash
npm install
npm run compile
```

### Tests

```bash
npm test
npm run test:coverage
```

### Projektstruktur

```
5d-database-plugin/
├── src/
│   ├── api/              # API-Layer pro Dimension
│   ├── core/             # Multi-DB-Manager, Migration, ID-Mapper
│   ├── ingestors/        # Ingestion-Module pro Dimension
│   ├── models/           # TypeScript-Modelle
│   ├── repositories/     # Repository-Layer pro Dimension
│   ├── services/         # Cross-Dimension-Services
│   ├── validators/       # Konsistenz- und Integritäts-Validierung
│   ├── mcp/              # MCP-Server Integration
│   ├── ui/               # VS Code UI-Komponenten
│   └── extension.ts      # Extension Entry Point
├── schemas/sqlite/       # SQL-Schema-Migrationen
└── __tests__/            # Tests
```

## Phase 2: Semantic Brain - ✅ IMPLEMENTIERT

Das Semantic Brain ist vollständig implementiert und bietet:

- ✅ **V-Dimension** - Vektordatenbank für Embeddings
- ✅ **Embedding System** - OpenAI-Integration für Embedding-Generierung
- ✅ **Semantic Search API** - Vector Similarity Search über alle Dimensionen
- ✅ **Importance Scoring** - PageRank und Betweenness Centrality
- ✅ **Navigation Metadata** - Entry Points und Clusters
- ✅ **Self-Understanding** - Bootstrap API, Self-Explanation API, Learning Paths
- ✅ **Deterministic Context Builder** - Strukturierter Kontext ohne KI-Generierung
- ✅ **MCP-Server Integration** - Vollständige Integration für LLM-Agenten

### Vektordatenbank

- **SQLite VSS** für macOS/Linux (native Extension)
- **ChromaDB** für Windows (HTTP-Server)
- **Platform-Detection** - Automatische Auswahl der besten Lösung
- **Graceful Degradation** - Fallback auf Cosine Similarity wenn keine verfügbar

Siehe `CHROMADB_SETUP.md` für ChromaDB-Konfiguration.

## Kernfunktionalität für LLM-Agenten

1. **Semantic Discovery**: Natürliche Sprache → relevante Code-Entitäten finden
2. **Deterministic Navigation**: Strukturierter Kontext aus Fakten (keine KI-Halluzinationen)
3. **Self-Understanding**: System erklärt sich selbst (Bootstrap API, Self-Explanation API)
4. **Learning Paths**: Geführte Pfade zum Erlernen des Systems
5. **Cross-Dimension Intelligence**: Verknüpfungen zwischen allen Dimensionen

## Dokumentation

- **`SETUP_NEW_PROJECT.md`** - Vollständiger Setup-Workflow für neue Projekte (gekoppelt mit Noyrax)
- **`MCP_SERVER_SETUP.md`** - MCP-Server-Konfiguration für LLM-Agenten (Claude Desktop, etc.)
- **`QUICK_START.md`** - Schnellstart-Anleitung für Entwickler
- **`CHROMADB_SETUP.md`** - ChromaDB-Installation und -Konfiguration (Windows)
- **`docs/adr/`** - Architecture Decision Records (32 ADRs dokumentieren alle Entscheidungen)

## Strategische Vision

- **[`../../VISION.md`](../../VISION.md)** - Vision: Autonome KI-gesteuerte Softwareentwicklung
- **[`../../INNOVATION_ANALYSIS.md`](../../INNOVATION_ANALYSIS.md)** - Innovations-Analyse: Was macht das System besonders?
- **[`../../PROBLEM_SOLUTION_MAPPING.md`](../../PROBLEM_SOLUTION_MAPPING.md)** - Problem-Lösung-Mapping
- **[`../../AI_CODING_IMPLICATIONS.md`](../../AI_CODING_IMPLICATIONS.md)** - AI-Coding Implications
- **[`../../BUSINESS_IMPACT.md`](../../BUSINESS_IMPACT.md)** - Business Impact: Kosteneinsparungen
- **[`../../QUALITY_IMPROVEMENT.md`](../../QUALITY_IMPROVEMENT.md)** - Qualitätsverbesserung
- **[`../../DOMAIN_TRANSFERABILITY.md`](../../DOMAIN_TRANSFERABILITY.md)** - Domänen-Transferfähigkeit

## License

MIT

