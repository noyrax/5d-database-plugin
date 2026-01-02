# Noyrax Workspace Integration – Warum funktionieren die Tools nicht?

## Problem

Die 5D Database Plugin Tools (`noyrax-5d-database-tool`, `noyrax-5d-database-query`, etc.) funktionieren **nicht** im Noyrax-Workspace nach `npm install @noyrax/5d-database-plugin`.

## Neue Features (ab Version 0.1.5)

**Automatische Workspace-Root-Erkennung:** Die Tools erkennen automatisch den Workspace-Root, wenn kein Parameter angegeben wird:

```bash
# Alte Syntax (funktioniert weiterhin)
noyrax-5d-database-tool . bootstrap

# Neue Syntax (automatische Erkennung)
noyrax-5d-database-tool bootstrap

# Workspace-Root wird automatisch auf aktuelles Arbeitsverzeichnis gesetzt
cd /path/to/noyrax-workspace
noyrax-5d-database-tool bootstrap
```

**Wichtig:** Die Tools suchen `docs/` im Workspace-Root (oder Parent-Directories) und erstellen SQLite-DBs in `.database-plugin/` im Workspace-Root.

## Mögliche Ursachen

### 1. Bin-Commands werden nicht installiert

**Symptom:** `noyrax-5d-database-tool` ist nicht verfügbar im PATH.

**Prüfung:**
```bash
# Im Noyrax-Workspace
ls node_modules/.bin/ | grep noyrax
```

**Lösung:** Bin-Commands sollten automatisch in `node_modules/.bin/` installiert werden. Falls nicht:
- Prüfe `package.json` `bin` Feld
- Prüfe ob `out/cli/*.js` im npm Package enthalten ist
- Prüfe ob `prepublishOnly` Script korrekt kompiliert

### 2. Module-Auflösung schlägt fehl

**Symptom:** `Error: Cannot find module '../core/multi-db-manager'`

**Ursache:** Relative Imports werden nicht korrekt aufgelöst, wenn Tools aus `node_modules/.bin/` aufgerufen werden.

**Prüfung:**
```bash
# Im Noyrax-Workspace
node node_modules/@noyrax/5d-database-plugin/out/cli/tool-cli.js . bootstrap
```

**Lösung:** Tools müssen `__dirname` verwenden, um den korrekten Package-Pfad zu finden.

### 3. `out/` Ordner fehlt im npm Package

**Symptom:** `Error: Cannot find module '@noyrax/5d-database-plugin/out/cli/tool-cli'`

**Prüfung:**
```bash
# Im Noyrax-Workspace
ls node_modules/@noyrax/5d-database-plugin/out/cli/
```

**Lösung:** `out/` muss im `files` Array in `package.json` enthalten sein (ist bereits vorhanden).

### 4. Dependencies fehlen

**Symptom:** `Error: Cannot find module 'dotenv'` oder andere Dependencies

**Prüfung:**
```bash
# Im Noyrax-Workspace
npm list @noyrax/5d-database-plugin
```

**Lösung:** Alle Dependencies müssen installiert sein. Prüfe `package.json` `dependencies` Feld.

## Debugging-Schritte (PowerShell)

### Schritt 1: Prüfe ob bin-Commands installiert sind

```powershell
# Im Noyrax-Workspace
Get-ChildItem node_modules\.bin\ | Where-Object { $_.Name -like "*noyrax*" }
```

**Erwartet:**
- `noyrax-5d-database`
- `noyrax-5d-database-mcp`
- `noyrax-5d-database-query`
- `noyrax-5d-database-tool`
- `noyrax-5d-database-search`
- `noyrax-5d-database-embedding`

**Falls nicht vorhanden:**
- Prüfe ob Package installiert ist: `npm list @noyrax/5d-database-plugin`
- Prüfe ob `package.json` `bin` Feld korrekt ist
- Prüfe ob `out/cli/*.js` im Package vorhanden ist

### Schritt 2: Prüfe ob Tools direkt funktionieren

```powershell
# Im Noyrax-Workspace (mit explizitem Workspace-Root)
node node_modules\@noyrax\5d-database-plugin\out\cli\tool-cli.js . bootstrap

# Oder mit automatischer Erkennung (aktuelles Verzeichnis)
cd C:\path\to\noyrax-workspace
noyrax-5d-database-tool bootstrap
```

**Erwartet:** JSON-Output mit Bootstrap-Informationen

**Falls Fehler:** Notiere die Fehlermeldung (Module nicht gefunden, etc.)

### Schritt 3: Prüfe ob `out/` Ordner vorhanden ist

```powershell
# Im Noyrax-Workspace
Get-ChildItem node_modules\@noyrax\5d-database-plugin\out\cli\
```

**Erwartet:** Alle CLI-Dateien vorhanden:
- `tool-cli.js`
- `query-cli.js`
- `ingest-cli.js`
- `semantic-search-cli.js`
- `embedding-cli.js`
- `mcp-server-cli.js`

**Falls nicht vorhanden:**
- Package wurde nicht korrekt kompiliert vor dem Publish
- Prüfe ob `prepublishOnly` Script ausgeführt wurde

### Schritt 4: Prüfe ob Dependencies installiert sind

```powershell
# Im Noyrax-Workspace
npm list @noyrax/5d-database-plugin --depth=0
```

**Erwartet:** Package installiert mit allen Dependencies

**Falls Dependencies fehlen:**
```powershell
# Dependencies manuell installieren
npm install
```

### Schritt 5: Prüfe ob `docs/` im Workspace vorhanden ist

```powershell
# Im Noyrax-Workspace
Test-Path docs\modules
Test-Path docs\index\symbols.jsonl
Test-Path docs\system\DEPENDENCY_GRAPH.md
Test-Path docs\adr
```

**Erwartet:** Alle `docs/` Unterordner vorhanden

**Falls nicht vorhanden:**
- Noyrax (Documentation System Plugin) muss zuerst ausgeführt werden
- Tools benötigen `docs/` im Workspace-Root (nicht im 5D-Workspace)

### Schritt 6: Prüfe ob SQLite-DBs erstellt werden

```powershell
# Im Noyrax-Workspace
Test-Path .database-plugin\modules.db
Test-Path .database-plugin\adrs.db
```

**Erwartet:** SQLite-DBs vorhanden in `.database-plugin/` im Workspace-Root

**Falls nicht vorhanden:**
- Ingestion ausführen: `noyrax-5d-database .` oder `noyrax-5d-database` (automatische Erkennung)

## Bekannte Probleme

### Problem: Relative Imports funktionieren nicht

**Ursache:** Wenn Tools aus `node_modules/.bin/` aufgerufen werden, werden relative Imports relativ zum aktuellen Arbeitsverzeichnis aufgelöst, nicht relativ zur Datei.

**Lösung:** Tools müssen `__dirname` verwenden, um den korrekten Package-Pfad zu finden. Aber das ist bei CommonJS-Modulen normalerweise nicht nötig, da Node.js Module relativ zur Datei auflöst.

**Prüfung:**
```bash
# Im Noyrax-Workspace
node -e "console.log(require.resolve('@noyrax/5d-database-plugin/out/cli/tool-cli.js'))"
```

## Lösung

Die Tools sollten funktionieren, wenn:
1. ✅ `out/` Ordner im npm Package enthalten ist
2. ✅ Bin-Commands in `package.json` definiert sind
3. ✅ `prepublishOnly` Script kompiliert vor dem Publish
4. ✅ Dependencies installiert sind
5. ✅ Relative Imports korrekt aufgelöst werden (Node.js macht das automatisch)
6. ✅ `docs/` im Noyrax-Workspace vorhanden ist (nicht im 5D-Workspace)
7. ✅ SQLite-DBs werden im Noyrax-Workspace erstellt (`.database-plugin/`)

## Häufige Probleme und Lösungen

### Problem: Bin-Commands sind nicht verfügbar

**Symptom:** `noyrax-5d-database-tool` ist nicht im PATH

**Lösung:**
```powershell
# Prüfe ob bin-Commands installiert sind
Get-ChildItem node_modules\.bin\ | Where-Object { $_.Name -like "*noyrax*" }

# Falls nicht vorhanden, Package neu installieren
npm uninstall @noyrax/5d-database-plugin
npm install @noyrax/5d-database-plugin
```

### Problem: `docs/` nicht gefunden

**Symptom:** `ERROR: docs/ directory not found in workspace or parent directories.`

**Lösung:**
- Noyrax (Documentation System Plugin) muss zuerst ausgeführt werden
- `docs/` muss im Noyrax-Workspace vorhanden sein (nicht im 5D-Workspace)
- Tools suchen `docs/` im Workspace-Root oder Parent-Directories

### Problem: SQLite-DBs werden im falschen Workspace erstellt

**Symptom:** SQLite-DBs werden im 5D-Workspace erstellt statt im Noyrax-Workspace

**Lösung:**
- Tools verwenden den Workspace-Root-Parameter (oder aktuelles Arbeitsverzeichnis)
- SQLite-DBs werden immer in `{workspace-root}/.database-plugin/` erstellt
- Im Noyrax-Workspace ausführen: `cd C:\path\to\noyrax-workspace && noyrax-5d-database`

### Problem: Module-Auflösung schlägt fehl

**Symptom:** `Error: Cannot find module '../core/multi-db-manager'`

**Lösung:**
- Prüfe ob `out/` Ordner im Package vorhanden ist
- Prüfe ob alle Dependencies installiert sind: `npm install`
- Prüfe ob TypeScript korrekt kompiliert wurde: `npm run compile` im 5D-Workspace

## Quick-Reference: Tool-Nutzung

### Mit explizitem Workspace-Root (alte Syntax)

```powershell
# Im Noyrax-Workspace
noyrax-5d-database-tool . bootstrap
noyrax-5d-database-query . modules src\file.ts
noyrax-5d-database .
```

### Mit automatischer Erkennung (neue Syntax)

```powershell
# Im Noyrax-Workspace
cd C:\path\to\noyrax-workspace
noyrax-5d-database-tool bootstrap
noyrax-5d-database-query modules src\file.ts
noyrax-5d-database
```

**Wichtig:** Tools verwenden immer das aktuelle Arbeitsverzeichnis als Workspace-Root, wenn kein Parameter angegeben wird.

