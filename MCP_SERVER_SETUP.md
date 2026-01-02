# MCP Server Setup für LLM-Agenten

## Übersicht

Der 5D Database Plugin MCP Server ermöglicht es LLM-Agenten (Claude, GPT, Cursor AI), über das Model Context Protocol (MCP) auf die Datenbanken zuzugreifen.

## Voraussetzungen

⚠️ **KRITISCH: System-Kopplung**

**Das Documentation System Plugin (Noyrax) und das 5D Database Plugin müssen beide installiert und konfiguriert sein!**

```
1. Documentation System Plugin (Noyrax) → generiert docs/
2. 5D Database Plugin → ingestiert docs/ in SQLite-DBs
3. MCP-Server → ermöglicht LLM-Agenten-Zugriff
```

## Installation

### Option 1: Via VS Code Extension (Development)

```bash
# 1. Extension kompilieren
cd 5d-database-plugin
npm install
npm run compile

# 2. MCP-Server direkt starten
node out/cli/mcp-server-cli.js /path/to/workspace
```

### Option 2: Via npm Package (wenn veröffentlicht)

```bash
# 1. Package installieren
npm install -g @noyrax/5d-database-plugin

# 2. MCP-Server starten
noyrax-5d-database-mcp /path/to/workspace
```

### Option 3: Via npx (ohne Installation)

```bash
npx -y @noyrax/5d-database-plugin mcp-server /path/to/workspace
```

## CLI-Tools für direkten Zugriff (AI-Agenten)

Für AI-Agenten (wie Cursor AI) stehen zusätzliche CLI-Tools zur Verfügung, die direkten Zugriff auf Datenbanken und Tools bieten, ohne MCP-Server-Prozess:

### Query-CLI (Datenbank-Queries)

Direkter Zugriff auf Datenbank-Queries:

```bash
# Query Module
noyrax-5d-database-query <workspace-root> modules <filePath>

# Query Symbols
noyrax-5d-database-query <workspace-root> symbols <path|symbolId>

# Query Dependencies
noyrax-5d-database-query <workspace-root> dependencies --from <path>
noyrax-5d-database-query <workspace-root> dependencies --to <path>

# Query ADRs
noyrax-5d-database-query <workspace-root> adrs --number <num>
noyrax-5d-database-query <workspace-root> adrs --path <path>

# Query Changes
noyrax-5d-database-query <workspace-root> changes
```

### Tool-CLI (MCP-Tools direkt)

Direkter Zugriff auf MCP-Tools ohne Server:

```bash
# Bootstrap
noyrax-5d-database-tool <workspace-root> bootstrap

# Semantic Discovery
noyrax-5d-database-tool <workspace-root> semantic_discovery "How does ingestion work?" [limit]

# System Explanation
noyrax-5d-database-tool <workspace-root> system_explanation

# Learning Path
noyrax-5d-database-tool <workspace-root> learning_path <topic>

# Cross Analysis
noyrax-5d-database-tool <workspace-root> cross_analysis <filePath>

# Gap Analysis (ab Version 0.1.8)
noyrax-5d-database-tool <workspace-root> gap_analysis [--min-deps N] [--limit N]

# Architecture Mining (ab Version 0.1.8)
noyrax-5d-database-tool <workspace-root> architecture_mining [filePath]
```

### Semantic-Search-CLI (V-Dimension)

Direkter Zugriff auf Semantic Search:

```bash
# Semantic Search
noyrax-5d-database-search <workspace-root> "How does the MCP server work?" --limit 10

# Mit spezifischen Dimensionen
noyrax-5d-database-search <workspace-root> "ingestion" --dimensions X,W --limit 5
```

**Vorteile für AI-Agenten:**
- Schneller als MCP-Server (kein JSON-RPC-Overhead)
- Direkter API-Zugriff
- JSON-Output einfach zu parsen
- Keine zusätzliche Infrastruktur nötig

## Konfiguration für LLM-Agenten

### Claude Desktop

Konfiguriere den MCP Server in `claude_desktop_config.json`:

**Windows:**
```
%APPDATA%\Claude\claude_desktop_config.json
```

**macOS:**
```
~/Library/Application Support/Claude/claude_desktop_config.json
```

**Linux:**
```
~/.config/Claude/claude_desktop_config.json
```

#### Konfiguration (Entwicklung - lokaler Pfad):

```json
{
  "mcpServers": {
    "5d-database": {
      "command": "node",
      "args": [
        "D:/path/to/5d-database-plugin/out/cli/mcp-server-cli.js",
        "${workspaceFolder}"
      ]
    }
  }
}
```

#### Konfiguration (Production - npm Package):

```json
{
  "mcpServers": {
    "5d-database": {
      "command": "npx",
      "args": [
        "-y",
        "@noyrax/5d-database-plugin",
        "mcp-server",
        "${workspaceFolder}"
      ]
    }
  }
}
```

### Andere LLM-Agenten

Der MCP-Server kommuniziert via stdin/stdout (JSON-RPC 2.0). Jeder MCP-kompatible Agent kann den Server nutzen, indem er:

1. Den Server als Child-Process startet: `node out/cli/mcp-server-cli.js <workspace-root>`
2. JSON-RPC 2.0 Requests via stdin sendet
3. JSON-RPC 2.0 Responses via stdout empfängt

## Verfügbare Tools

Der MCP-Server stellt folgende Tools bereit:

| Tool | Beschreibung | Parameter |
|------|--------------|-----------|
| `bootstrap` | Erste Anlaufstelle für Agenten ohne Vorwissen | `pluginId` |
| `semantic_discovery` | Semantic Search in natürlicher Sprache | `query`, `pluginId`, `limit?` |
| `system_explanation` | System-Übersicht, Entry Points, Architecture ADRs | `pluginId` |
| `learning_path` | Geführter Lernpfad für ein Topic | `topic`, `pluginId` |
| `query_modules` | Query Module nach filePath | `filePath`, `pluginId` |
| `query_symbols` | Query Symbols nach path oder symbolId | `path?`, `symbolId?`, `pluginId` |
| `query_dependencies` | Query Dependencies nach fromModule oder toModule | `fromModule?`, `toModule?`, `pluginId` |
| `cross_analysis` | Cross-Dimension-Analyse für filePath | `filePath`, `pluginId` |
| `gap_analysis` | Findet Dokumentationslücken (Module mit vielen Dependencies aber wenigen ADRs) | `pluginId`, `minDependencies?` (default: 5), `limit?` (default: 50) |
| `architecture_mining` | Leitet Architektur-Entscheidungen aus Code-Struktur ab | `pluginId`, `filePath?` (optional, für spezifische Datei) |
| `generate_documentation` | Generiert Dokumentation mit Noyrax (scan → validate → generate) | `pluginId` |
| `check_docs_status` | Prüft ob docs/ existiert und aktuell ist | `pluginId` |

## Verfügbare Resources

| Resource | Beschreibung | URI Format |
|----------|--------------|------------|
| Modules | Alle Module (X-Dimension) | `db://modules/{pluginId}` |
| Symbols | Alle Symbols (Y-Dimension) | `db://symbols/{pluginId}` |
| Dependencies | Alle Dependencies (Z-Dimension) | `db://dependencies/{pluginId}` |
| ADRs | Alle ADRs (W-Dimension) | `db://adrs/{pluginId}` |
| Changes | Alle Change Reports (T-Dimension) | `db://changes/{pluginId}` |

## Workflow

### 1. Dokumentation generieren (Noyrax)

```bash
# Documentation System Plugin ausführen
noyrax-documentation generate /path/to/workspace
# Erstellt docs/ Ordner mit allen 5 Dimensionen
```

### 2. Ingestion ausführen (5D Database Plugin)

```bash
# 5D Database Plugin ausführen
noyrax-5d-database ingest /path/to/workspace
# Liest docs/ und speichert in SQLite-DBs (.database-plugin/)
```

### 3. MCP-Server starten

```bash
# MCP-Server starten (für LLM-Agenten)
noyrax-5d-database-mcp /path/to/workspace
```

### 4. LLM-Agent nutzen

Der LLM-Agent kann nun:
- `bootstrap` Tool aufrufen, um System zu verstehen
- `semantic_discovery` Tool nutzen, um relevante Code-Entitäten zu finden
- `system_explanation` Tool nutzen, um Entry Points zu finden
- `learning_path` Tool nutzen, um geführte Lernpfade zu generieren
- Resources lesen, um auf Datenbanken zuzugreifen

## Troubleshooting

### "docs/ directory not found"

**Problem:** Documentation System Plugin wurde nicht ausgeführt.

**Lösung:**
```bash
# Schritt 1: Dokumentation generieren
noyrax-documentation generate /path/to/workspace
```

### "No modules found in database"

**Problem:** Ingestion wurde nicht ausgeführt.

**Lösung:**
```bash
# Schritt 2: Ingestion ausführen
noyrax-5d-database ingest /path/to/workspace
```

### "MCP Server connection failed"

**Problem:** MCP-Server konnte nicht gestartet werden.

**Lösung:**
1. Prüfe ob beide Plugins installiert sind (Noyrax + 5D Database)
2. Prüfe ob `docs/` existiert
3. Prüfe ob Ingestion ausgeführt wurde
4. Prüfe MCP-Server-Konfiguration in Claude Desktop

### "Permission denied" beim Starten des Servers

**Problem:** Node.js-Script ist nicht ausführbar.

**Lösung (Linux/macOS):**
```bash
chmod +x out/cli/mcp-server-cli.js
```

## Beispiel-Interaktion

### 1. Bootstrap (First Contact)

**LLM-Agent fragt:**
```json
{
  "method": "tools/call",
  "params": {
    "name": "bootstrap",
    "arguments": {
      "pluginId": "a1b2c3d4e5f6g7h8"
    }
  }
}
```

**Server antwortet:**
```json
{
  "content": [{
    "type": "text",
    "text": "{\"what_am_i\": \"...\", \"where_to_start\": [...], ...}"
  }]
}
```

### 2. Semantic Discovery

**LLM-Agent fragt:**
```json
{
  "method": "tools/call",
  "params": {
    "name": "semantic_discovery",
    "arguments": {
      "query": "How does ingestion work?",
      "pluginId": "a1b2c3d4e5f6g7h8",
      "limit": 10
    }
  }
}
```

**Server antwortet:**
```json
{
  "content": [{
    "type": "text",
    "text": "{\"entities\": [...], \"context\": {...}}"
  }]
}
```

## CLI-Tools vs. MCP-Server

**MCP-Server** ist für externe LLM-Agenten gedacht, die keine direkte Codebase-Zugriff haben (z.B. Claude Desktop).

**CLI-Tools** sind für AI-Agenten gedacht, die direkten Codebase-Zugriff haben (z.B. Cursor AI):

- `noyrax-5d-database-query` - Direkte Datenbank-Queries
- `noyrax-5d-database-tool` - MCP-Tools direkt nutzen
- `noyrax-5d-database-search` - Semantic Search direkt

**Vorteile CLI-Tools:**
- Schneller (kein JSON-RPC-Overhead)
- Einfacher zu nutzen (direkter API-Zugriff)
- Kein Server-Prozess nötig

**Wann MCP-Server nutzen:**
- Externe LLM-Agenten (Claude Desktop, etc.)
- Standardisiertes Protokoll (JSON-RPC 2.0)
- Tool-Integration in Agent-UIs

## Weitere Informationen

- Siehe `SETUP_NEW_PROJECT.md` für vollständigen Setup-Workflow
- Siehe `README.md` für allgemeine Plugin-Dokumentation
- Siehe ADR-007 für MCP-Server-Architektur-Details
- Siehe ADR-028 für Semantic Brain MCP-Tools
- Siehe ADR-033 für MCP-Server CLI-Integration und System-Kopplung
- Siehe ADR-034 für Gap Analysis Tool
- Siehe ADR-035 für Architecture Mining Tool

**Hinweis:** Die Tools `gap_analysis` und `architecture_mining` sind ab Version 0.1.8 verfügbar.

