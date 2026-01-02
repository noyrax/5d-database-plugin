# Setup Noyrax + 5D Database Plugin für neues Projekt

## ⚠️ KRITISCH: System-Kopplung

**Das Documentation System Plugin (Noyrax) und das 5D Database Plugin funktionieren nur gemeinsam!**

```
Noyrax (Documentation System) → generiert docs/ → 5D Database Plugin → SQLite-DBs → MCP-Server
```

Die beiden Plugins sind eng gekoppelt:
- **Noyrax** generiert die `docs/` Ordnerstruktur mit allen 5 Dimensionen
- **5D Database Plugin** liest `docs/` und speichert die Daten in SQLite-Datenbanken
- **MCP-Server** ermöglicht LLM-Agenten-Zugriff auf die Datenbanken

### Monorepo-Integration

In diesem Workspace sind beide Plugins als Monorepo integriert:
- `documentation-system-plugin/` - Noyrax Documentation System Plugin
- `5d-database-plugin/` - 5D Database Plugin
- `docs/` - Gemeinsam genutzte Dokumentation

**Vorteile der Monorepo-Integration:**
- Beide Plugins im gleichen Workspace
- Einfache Workflow-Koordination
- MCP-Server kann auf beide Plugins zugreifen
- Gemeinsame `docs/` Ordnerstruktur

## Voraussetzungen

1. **Node.js installiert** (Version 16.x oder höher)
2. **(Optional) VS Code** für UI-Integration
3. **Beide Plugins müssen installiert werden** (Noyrax + 5D Database)

### Monorepo-Setup (Dieser Workspace)

Wenn beide Plugins im gleichen Workspace sind (Monorepo):

```bash
# Workspace-Root: Alle Dependencies installieren
npm install

# Alle Plugins kompilieren
npm run compile:all

# Vollständiger Workflow (Generate Docs → Ingest → Embeddings)
npm run workflow:full
```

Siehe `README.md` (Workspace-Root) für vollständige Workspace-Dokumentation.

## Schritt 1: Documentation System Plugin (Noyrax) installieren

### Option A: VS Code Extension

```bash
code --install-extension documentation-system-plugin.vsix
```

### Option B: npm Package (wenn veröffentlicht)

```bash
npm install -g @noyrax/documentation-system-plugin
```

## Schritt 2: Dokumentation generieren

Der erste Schritt ist, die Dokumentation für dein Projekt zu generieren.

### Via VS Code Command

1. Öffne dein Projekt in VS Code
2. `Ctrl+Shift+P` (oder `Cmd+Shift+P` auf macOS)
3. Wähle: **"Generate Documentation"** (oder entsprechenden Command)
4. Das Plugin generiert den `docs/` Ordner mit:
   - `docs/modules/*.md` (X-Dimension: Modul-Dokumentation)
   - `docs/index/symbols.jsonl` (Y-Dimension: Symbol-Index)
   - `docs/system/DEPENDENCY_GRAPH.md` (Z-Dimension: Dependency-Graph)
   - `docs/adr/*.md` (W-Dimension: Architecture Decision Records)
   - `docs/system/CHANGE_REPORT.md` (T-Dimension: Change Reports)

### Via CLI

```bash
noyrax-documentation generate /path/to/your-project
```

**Erwartete Ausgabe:**
```
[Documentation System Plugin] Scanning project...
[Documentation System Plugin] Generating documentation...
[Documentation System Plugin] Created docs/modules/...
[Documentation System Plugin] Created docs/index/symbols.jsonl
[Documentation System Plugin] Created docs/system/DEPENDENCY_GRAPH.md
[Documentation System Plugin] Documentation generated successfully
```

## Schritt 3: 5D Database Plugin installieren

Jetzt installieren wir das 5D Database Plugin, das die generierte Dokumentation in Datenbanken speichert.

### Monorepo (Dieser Workspace)

Das 5D Database Plugin ist bereits im Workspace integriert. Ingestion kann via Workspace-Scripts ausgeführt werden:

```bash
# Dokumentation ingestieren
npm run db:ingest

# Embeddings generieren
npm run db:embedding

# Vollständiger Workflow (Generate Docs → Ingest → Embeddings)
npm run workflow:full
```

### Option A: VS Code Extension (Separate Plugins)

```bash
code --install-extension 5d-database-plugin-0.1.0.vsix
```

### Option B: npm Package (wenn veröffentlicht)

```bash
npm install -g @noyrax/5d-database-plugin
```

### Option C: Lokal (Development)

```bash
cd 5d-database-plugin
npm install
npm run compile
```

## Schritt 4: Workspace öffnen

Öffne dein Projekt in VS Code (oder arbeite direkt im Terminal):

```bash
code /path/to/your-project
```

**Wichtig:** Der `docs/` Ordner muss existieren! Falls nicht, wiederhole Schritt 2.

## Schritt 5: Ingestion ausführen

Jetzt ingestieren wir die Dokumentation in die SQLite-Datenbanken.

### Via VS Code Command

1. `Ctrl+Shift+P` (oder `Cmd+Shift+P` auf macOS)
2. Wähle: **"Ingest Documentation"** (Command: `5d-database.ingest`)
3. Das Plugin:
   - Liest alle Dateien aus `docs/`
   - Erstellt SQLite-Datenbanken in `.database-plugin/`
   - Speichert alle 5 Dimensionen (X, Y, Z, W, T)

**Erwartete Ausgabe (Output-Channel):**
```
[5D Database Plugin] Found docs directory: /path/to/your-project/docs
[5D Database Plugin] Running database migrations...
[5D Database Plugin] Database migrations completed
[5D Database Plugin] Starting ingestion...
[5D Database Plugin] Ingestion completed successfully
```

### Via CLI

```bash
# Inkrementelle Ingestion (Standard)
noyrax-5d-database ingest /path/to/your-project

# Vollständige Ingestion (alle Daten neu laden)
noyrax-5d-database ingest /path/to/your-project --full
```

**Erwartete Ausgabe:**
```
[Ingest CLI] Found docs directory: /path/to/your-project/docs
[Ingest CLI] Running database migrations...
[Ingest CLI] Database migrations completed
[Ingest CLI] Starting ingestion...
[Ingest CLI] Ingestion completed successfully
```

## Schritt 6: Unified MCP Server Setup

Der Unified MCP Server orchestriert beide Plugins und bietet einen zentralen Zugriff für AI-Agenten (Cursor, VS Code, Claude Desktop).

### Schritt 6.1: MCP Server kompilieren

```bash
# MCP Server kompilieren
npm run mcp:build

# Oder direkt
cd mcp-server
npm run compile
```

**Verifikation:**
```bash
# Prüfen ob MCP Server kompiliert wurde
Test-Path mcp-server/out/cli/server-cli.js
```

### Schritt 6.2: MCP Server testen

```bash
# MCP Server starten (für Testing)
npm run mcp:start .

# Oder direkt
node mcp-server/out/cli/server-cli.js .
```

**Erwartete Ausgabe:**
```
[UnifiedMcpServer] Initializing...
[UnifiedMcpServer] Database Plugin available: true
[UnifiedMcpServer] Documentation Plugin available: true
[UnifiedMcpServer] Registered 20 tools
[UnifiedMcpServer] Server ready
```

### Schritt 6.3: Cursor Konfiguration

Erstellen Sie `.cursor/mcp-config.json` im Workspace-Root:

```json
{
  "mcpServers": {
    "noyrax": {
      "command": "node",
      "args": [
        "${workspaceFolder}/mcp-server/out/cli/server-cli.js",
        "${workspaceFolder}"
      ],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

**Nach Konfiguration:**
1. Cursor vollständig schließen
2. Cursor neu öffnen
3. MCP Server sollte automatisch verbinden

**Verifikation:**
- Öffnen Sie Cursor Chat
- Fragen Sie: "Was ist das System?" oder "System-Status prüfen"
- Der AI-Agent sollte über MCP Server Tools zugreifen können

Siehe [mcp-server/INSTALLATION_GUIDE.md](../mcp-server/INSTALLATION_GUIDE.md) für detaillierte Cursor-Konfiguration.

### Schritt 6.4: VS Code Konfiguration

Erstellen Sie `.vscode/settings.json` im Workspace-Root:

```json
{
  "mcp.servers": {
    "noyrax": {
      "command": "node",
      "args": [
        "${workspaceFolder}/mcp-server/out/cli/server-cli.js",
        "${workspaceFolder}"
      ],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

**Nach Konfiguration:**
1. `Ctrl+Shift+P` → "Developer: Reload Window"
2. MCP Server sollte automatisch verbinden

**Verifikation:**
- Öffnen Sie GitHub Copilot Chat
- Fragen Sie: "Was ist das System?" oder "System-Status prüfen"
- Der AI-Agent sollte über MCP Server Tools zugreifen können

Siehe [mcp-server/INSTALLATION_GUIDE.md](../mcp-server/INSTALLATION_GUIDE.md) für detaillierte VS Code-Konfiguration.

### Schritt 6.5: Claude Desktop Konfiguration (Optional)

Falls Sie Claude Desktop nutzen möchten:

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

**Konfiguration:**
```json
{
  "mcpServers": {
    "noyrax": {
      "command": "node",
      "args": [
        "D:/path/to/workspace/mcp-server/out/cli/server-cli.js",
        "${workspaceFolder}"
      ]
    }
  }
}
```

**Hinweis:** Verwenden Sie absolute Pfade für Claude Desktop.

Siehe [mcp-server/INSTALLATION_GUIDE.md](../mcp-server/INSTALLATION_GUIDE.md) für detaillierte Claude Desktop-Konfiguration.

## Workflow für Updates

Nach Code-Änderungen musst du beide Schritte wiederholen:

### 1. Dokumentation neu generieren (Noyrax)

```bash
# Via CLI
noyrax-documentation generate /path/to/your-project

# Oder via VS Code Command
# Ctrl+Shift+P → "Generate Documentation"
```

### 2. Ingestion ausführen (5D Database Plugin)

```bash
# Via CLI (inkrementell - nur geänderte Dateien)
noyrax-5d-database ingest /path/to/your-project

# Oder via VS Code Command
# Ctrl+Shift+P → "Ingest Documentation"
```

**Hinweis:** Die Ingestion ist hash-basiert und aktualisiert nur geänderte Dateien. Für vollständige Neu-Erstellung nutze `--full` Flag.

## Verifizierung

Nach dem Setup solltest du haben:

1. ✅ `docs/` Ordner mit allen 5 Dimensionen
2. ✅ `.database-plugin/` Ordner mit SQLite-Datenbanken:
   - `modules.db` (X-Dimension)
   - `symbols.db` (Y-Dimension)
   - `dependencies.db` (Z-Dimension)
   - `adrs.db` (W-Dimension)
   - `changes.db` (T-Dimension)
   - `vectors.db` (V-Dimension: Embeddings)
3. ✅ MCP Server kompiliert (`mcp-server/out/cli/server-cli.js` existiert)
4. ✅ Cursor/VS Code konfiguriert (`.cursor/mcp-config.json` oder `.vscode/settings.json` existiert)

### System-Status prüfen

**Via MCP Server (wenn konfiguriert):**

In Cursor/VS Code Chat:
```
System-Status prüfen
```

Oder nutzen Sie das Tool direkt:
```
workflow/check_status
```

**Via CLI (Fallback):**

```bash
# System-Übersicht
node 5d-database-plugin/out/cli/tool-cli.js . system_explanation

# System-Status (falls verfügbar)
node mcp-server/out/cli/server-cli.js .  # MCP Server starten
```

### Erste Nutzung

Nach erfolgreicher Installation können Sie die Tools nutzen:

**In Cursor/VS Code Chat:**
- "Was ist das System?" → Nutzt `system_explanation` Tool
- "Wie funktioniert X?" → Nutzt `semantic_discovery` Tool
- "Welche ADRs gibt es?" → Nutzt `query_adrs` Tool
- "System-Status prüfen" → Nutzt `workflow/check_status` Tool

**Via CLI (Fallback):**
```bash
# System-Übersicht
node 5d-database-plugin/out/cli/tool-cli.js . bootstrap

# Semantic Search
node 5d-database-plugin/out/cli/tool-cli.js . semantic_discovery "Wie funktioniert X?" 5

# ADR abfragen (korrekte Syntax)
node 5d-database-plugin/out/cli/query-cli.js . adrs --number 040
```

## Troubleshooting

### "docs/ directory not found"

**Problem:** Documentation System Plugin wurde nicht ausgeführt oder `docs/` wurde nicht generiert.

**Lösung:**
1. Prüfe ob Noyrax Extension installiert ist
2. Führe "Generate Documentation" Command aus
3. Prüfe ob `docs/` Ordner existiert

### "WARNING: Some required documentation files are missing"

**Problem:** Nicht alle erwarteten Dateien wurden generiert.

**Lösung:**
1. Prüfe `docs/modules/`, `docs/index/symbols.jsonl`, etc.
2. Führe Documentation Generation erneut aus
3. Prüfe Noyrax-Logs für Fehler

### "Database migrations failed"

**Problem:** Datenbank-Migrationen konnten nicht ausgeführt werden.

**Lösung:**
1. Prüfe ob `.database-plugin/` Ordner beschreibbar ist
2. Prüfe ob SQLite-Datenbanken nicht gesperrt sind
3. Lösche `.database-plugin/` Ordner und starte neu (Migrationen werden erneut ausgeführt)

### "Ingestion failed"

**Problem:** Ingestion konnte nicht abgeschlossen werden.

**Lösung:**
1. Prüfe `docs/` Ordner - sind alle Dateien vorhanden?
2. Prüfe Output-Channel/Logs für Fehler-Details
3. Versuche vollständige Ingestion: `--full` Flag

### Extension aktiviert sich nicht

**Problem:** 5D Database Extension aktiviert sich nicht automatisch.

**Lösung:**
1. Prüfe Output-Channel "5D Database Plugin" für Fehler
2. Prüfe ob Extension installiert ist: `Ctrl+Shift+X` → Suche "5D Database Plugin"
3. Reload Window: `Ctrl+Shift+P` → "Developer: Reload Window"

## Nächste Schritte

- **MCP-Server Setup:** Siehe [mcp-server/INSTALLATION_GUIDE.md](../mcp-server/INSTALLATION_GUIDE.md) für vollständige Anleitung
- **Semantic Search:** Siehe `README.md` - Semantic Brain Features
- **Architektur:** Siehe `docs/adr/` für Architecture Decision Records
- **Cursor Rules:** Siehe `.cursor/rules/` für AI-Agent Workflows

## Zusammenfassung

Der Setup-Workflow ist immer derselbe:

```
1. Dependencies installieren → npm install
2. Alle Plugins kompilieren → npm run compile:all
3. Dokumentation generieren → npm run docs:full .
4. Datenbanken ingestieren → npm run db:ingest .
5. Embeddings generieren → npm run db:embedding .
6. MCP Server kompilieren → npm run mcp:build
7. Cursor/VS Code konfigurieren → .cursor/mcp-config.json oder .vscode/settings.json
8. System testen → "System-Status prüfen" in Chat
```

**Wichtig:** 
- Beide Plugins sind gekoppelt und müssen zusammen verwendet werden!
- Unified MCP Server orchestriert beide Plugins und bietet zentralen Zugriff
- Siehe [mcp-server/INSTALLATION_GUIDE.md](../mcp-server/INSTALLATION_GUIDE.md) für vollständige Anleitung

