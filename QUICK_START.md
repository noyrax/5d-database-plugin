# Quick Start - 5D Database Plugin

## Systemkontext

Das 5D Database Plugin ist Teil eines **5-dimensionalen Navigationsraums**:

| Dimension | Artefakt | Funktion |
|-----------|----------|----------|
| **X (Modules)** | `docs/modules/*.md` | API-Dokumentation pro Datei |
| **Y (Symbols)** | `docs/index/symbols.jsonl` | Symbole mit Dependencies |
| **Z (Dependencies)** | `docs/system/DEPENDENCY_GRAPH.md` | Modul-Abhängigkeiten |
| **W (ADRs)** | `docs/adr/*.md` | Architektur-Entscheidungen |
| **T (Changes)** | `docs/system/CHANGE_REPORT.md` | Änderungen über die Zeit |

Die Extension findet `docs/` automatisch in Workspace-Folders und Parent-Directories (siehe ADR-010).

## Setup (einmalig)

### 1. Dependencies installieren
```bash
cd 5d-database-plugin
npm install
```

### 2. Extension kompilieren
```bash
npm run compile
```

**Wichtig:** Nach jeder Code-Änderung muss neu kompiliert werden:
```bash
npm run compile
```

Oder im Watch-Mode (kompiliert automatisch bei Änderungen):
```bash
npm run watch
```

## Produktives Testen (empfohlen)

**Warum produktives Testen?**
- Echte Daten aus `docs/` werden verwendet
- Echte SQLite-Datenbanken werden erstellt
- Keine komplizierte Debug-Konfiguration nötig
- Extension funktioniert wie im produktiven Einsatz

### Schritt 1: Extension lokal installieren

#### Option A: Via VS Code UI (empfohlen)

1. **Extension kompilieren:**
   ```bash
   cd 5d-database-plugin
   npm run compile
   ```

2. **Extension installieren:**
   - Öffne VS Code
   - `Ctrl+Shift+X` → Extensions Panel
   - Klicke auf "..." (mehr Optionen) → "Install from VSIX..."
   - Wähle den `5d-database-plugin` Ordner (oder eine `.vsix` Datei, falls vorhanden)

3. **VS Code neu laden:**
   - `Ctrl+Shift+P` → "Developer: Reload Window"

#### Option B: Via Command Line

1. **Extension kompilieren:**
   ```bash
   cd 5d-database-plugin
   npm run compile
   ```

2. **Extension installieren:**
   ```bash
   code --install-extension .
   ```
   (Führe den Befehl im `5d-database-plugin` Ordner aus)

3. **VS Code neu laden:**
   - `Ctrl+Shift+P` → "Developer: Reload Window"

### Schritt 2: VS Code im Root-Ordner öffnen

**Wichtig:** VS Code muss im Root-Ordner geöffnet sein, wo `docs/` liegt:

```bash
# Im Root-Ordner öffnen
cd "D:\Datenbank für Noyrax"
code .
```

Oder öffne VS Code manuell im Ordner `Datenbank für Noyrax/` (wo `docs/` liegt).

### Schritt 3: Extension testen

1. **Extension aktiviert sich automatisch:**
   - Extension aktiviert sich beim Start (`onStartupFinished`)
   - Du solltest sehen: "5D Database Plugin activated"
   - Status Bar zeigt: `$(database) 5D DB`

2. **Output-Channel prüfen:**
   - `Ctrl+Shift+P` → "Output: Show Output Channel"
   - Wähle "5D Database Plugin"
   - Prüfe die Logs:
     - "Using workspace root: ..."
     - "Found docs/ directory: ..." (oder Warnung, wenn nicht gefunden)
     - "Database migrations completed"
     - "=== 5D Database Plugin Activation Completed Successfully ==="

3. **Commands testen:**
   - `Ctrl+Shift+P` → "Ingest Documentation" (Command: `5d-database.ingest`)
   - Oder: Klicke auf Status Bar Icon (`$(database) 5D DB`)

4. **Database Explorer prüfen:**
   - Sidebar → "5D Database Explorer"
   - Sollte alle 5 Dimensionen anzeigen:
     - X: Modules
     - Y: Symbols
     - Z: Dependencies
     - W: ADRs
     - T: Changes

### Was passiert bei der Aktivierung?

1. **Extension wird geladen:**
   - VS Code lädt `out/extension.js`
   - `activate()` Funktion wird aufgerufen

2. **Workspace wird erkannt:**
   - Extension prüft Workspace-Folders
   - Falls kein Workspace: Fallback auf Storage-Path
   - Logs zeigen: "Using workspace root: ..."

3. **docs/ wird gesucht:**
   - Extension sucht in Workspace-Folders (alphabetisch sortiert)
   - Sucht in Parent-Directories (bis zu 5 Ebenen)
   - Zeigt Warnung, wenn nicht gefunden
   - Logs zeigen: "Found docs/ directory: ..." oder "WARNING: docs/ directory not found"

4. **Datenbanken werden initialisiert:**
   - Migrationen werden ausgeführt
   - 5 SQLite-Datenbanken werden erstellt (falls nicht vorhanden) in `.database-plugin/`:
     - `modules.db` (X-Dimension)
     - `symbols.db` (Y-Dimension)
     - `dependencies.db` (Z-Dimension)
     - `adrs.db` (W-Dimension)
     - `changes.db` (T-Dimension)
   - Logs zeigen: "Database migrations completed"

5. **UI wird registriert:**
   - Status Bar Provider
   - Database Explorer Provider
   - Commands werden registriert
   - Logs zeigen: "Registering UI components..." und "Registering commands..."

6. **Aktivierung abgeschlossen:**
   - Info-Message: "5D Database Plugin activated"
   - Output-Channel zeigt: "=== 5D Database Plugin Activation Completed Successfully ==="

## CLI-Tool (Alternative)

Das CLI-Tool kann **ohne VS Code Extension** verwendet werden, z.B. für CI/CD oder Automatisierung.

### Verwendung

```bash
# Inkrementelle Ingestion (Standard)
node out/cli/ingest-cli.js "D:\Datenbank für Noyrax"

# Vollständige Ingestion (alle Daten neu laden)
node out/cli/ingest-cli.js "D:\Datenbank für Noyrax" --full
```

### Was macht das CLI-Tool?

1. **Datenbanken initialisieren:**
   - Führt Migrationen aus
   - Erstellt 5 SQLite-Datenbanken in `.database-plugin/`

2. **Dokumentation ingestieren:**
   - Liest alle 5 Dimensionen aus `docs/`:
     - X: `docs/modules/*.md`
     - Y: `docs/index/symbols.jsonl`
     - Z: `docs/system/DEPENDENCY_GRAPH.md`
     - W: `docs/adr/*.md`
     - T: `docs/system/CHANGE_REPORT.md`

3. **Hash-basierte Änderungserkennung:**
   - Inkrementeller Modus: Nur geänderte Dateien werden neu ingestiert
   - Vollständiger Modus: Alle Dateien werden neu ingestiert

### Vorteile

- ✅ Funktioniert ohne VS Code
- ✅ Nützlich für CI/CD-Pipelines
- ✅ Automatisierung möglich
- ✅ Kann in Scripts eingebunden werden

## Debug-Modus (optional, nur für Extension-Entwicklung)

**Hinweis:** Debug-Modus ist nur für die Entwicklung der Extension selbst gedacht. Für produktives Testen verwende die lokale Installation (siehe oben).

### Voraussetzungen

- VS Code muss im Extension-Ordner (`5d-database-plugin/`) geöffnet sein
- Debug-Konfiguration (`5d-database-plugin/.vscode/launch.json`) muss vorhanden sein

### Verwendung

1. **VS Code im Extension-Ordner öffnen:**
   ```bash
   cd 5d-database-plugin
   code .
   ```

2. **Extension starten:**
   - Drücke `F5` oder öffne Debug-Panel (`Ctrl+Shift+D`)
   - Wähle die Konfiguration **"Run Extension"**
   - Die Extension wird automatisch kompiliert (preLaunchTask)
   - Extension Development Host öffnet sich

3. **Im Extension Development Host:**
   - Öffne den Root-Ordner manuell: `File` → `Open Folder...` → `D:\Datenbank für Noyrax`
   - Extension aktiviert sich automatisch
   - Teste die Extension

**Wichtig:** Der Debug-Modus ist nicht zuverlässig für produktives Testen, da der Root-Ordner nicht automatisch geöffnet wird. Verwende stattdessen die lokale Installation.

## Troubleshooting

### Extension aktiviert sich nicht

1. **Prüfe Kompilierung:**
   - Existiert `out/extension.js`?
   - Führe `npm run compile` aus und prüfe auf Fehler

2. **Prüfe Output-Channel:**
   - `Ctrl+Shift+P` → "Output: Show Output Channel" → "5D Database Plugin"
   - Suche nach Fehlermeldungen
   - Detaillierte Logs zeigen jeden Schritt der Aktivierung

3. **Prüfe Developer Tools:**
   - `Help` → `Toggle Developer Tools`
   - Console-Tab → Suche nach Fehlern

4. **Prüfe Extension-Status:**
   - `Ctrl+Shift+P` → "Extensions: Show Installed Extensions"
   - Suche nach "5D Database Plugin"
   - Prüfe ob Extension aktiviert ist

### Commands sind nicht verfügbar

1. **Extension wurde aktiviert?**
   - Prüfe Output-Channel "5D Database Plugin"
   - Sollte "Activation Completed Successfully" zeigen

2. **Workspace-Ordner korrekt?**
   - VS Code muss im Root-Ordner geöffnet sein (wo `docs/` liegt)
   - Extension sucht automatisch nach `docs/` in Workspace und Parent-Directories

3. **Extension neu laden:**
   - `Ctrl+Shift+P` → "Developer: Reload Window"

### docs/ wird nicht gefunden

1. **Workspace-Ordner prüfen:**
   - VS Code muss im Root-Ordner geöffnet sein
   - `docs/` sollte im Root-Ordner liegen

2. **Output-Channel prüfen:**
   - Extension zeigt Warnung, wenn `docs/` nicht gefunden wird
   - Ingestion wird übersprungen, aber Extension funktioniert trotzdem
   - Logs zeigen: "WARNING: docs/ directory not found in workspace folders or parent directories."

3. **Manuell prüfen:**
   - Prüfe ob `docs/` Verzeichnis existiert
   - Extension sucht in Workspace-Folders und bis zu 5 Parent-Directories
   - Prüfe die Logs im Output-Channel für Details

### Datenbank-Fehler

1. **Prüfe Datenbank-Verzeichnis:**
   - Datenbanken werden in `.database-plugin/` erstellt
   - Prüfe ob Verzeichnis existiert und beschreibbar ist

2. **Prüfe Migrationen:**
   - Output-Channel zeigt: "Database migrations completed"
   - Falls Fehler: Prüfe Logs für Details

3. **Datenbanken zurücksetzen:**
   - Lösche `.database-plugin/` Verzeichnis
   - Extension erstellt Datenbanken neu beim nächsten Start

## Workflow für Entwicklung

1. **Code ändern** in `src/`
2. **Kompilieren:** `npm run compile` (oder `npm run watch`)
3. **Extension neu laden:** `Ctrl+Shift+P` → "Developer: Reload Window"
4. **Extension testen** im Root-Ordner (wo `docs/` liegt)

## Wichtige Dateien

- `src/extension.ts` - Extension Entry Point
- `package.json` - Extension Manifest (Commands, Views)
- `out/extension.js` - Kompilierte Extension (muss existieren!)
- `src/cli/ingest-cli.ts` - CLI-Tool für Ingestion
- `src/core/docs-path-resolver.ts` - Automatische docs/ Erkennung
- `tsconfig.json` - TypeScript Konfiguration

## Verwandte Dokumentation

- **ADR-008**: Phase 1.8 - VS Code Extension & UI
- **ADR-010**: Multi-Level Docs Path Resolution
- **README.md**: Vollständige Dokumentation der Extension
