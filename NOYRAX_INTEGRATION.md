# Noyrax Integration und Synchronisation

**Datum:** 2025-12-29  
**System:** 5D Database Plugin + Noyrax Documentation System Plugin

## System-Kopplung

Die beiden Plugins sind **losely coupled** über den `docs/` Ordner:

```
Noyrax (Documentation System) 
  → generiert docs/ (Dateien)
  → 5D Database Plugin 
  → liest docs/ und speichert in SQLite-DBs
```

**Wichtig:** Es gibt **KEINE direkte Kommunikation** zwischen den Plugins. Die Kopplung erfolgt über Dateien im `docs/` Ordner.

## Was passiert, wenn Noyrax in einem neuen Fenster geöffnet wird?

### Szenario 1: Noyrax generiert `docs/` neu

**Ablauf:**
1. Noyrax wird in einem neuen VS Code-Fenster geöffnet
2. Noyrax scannt den Code und generiert `docs/` Ordner neu
3. Alle Dateien in `docs/` werden aktualisiert/überschrieben

**Auswirkung auf 5D Database Plugin:**
- ⚠️ **5D Database Plugin erkennt Änderungen NICHT automatisch**
- ⚠️ **SQLite-Datenbanken werden NICHT automatisch aktualisiert**
- ✅ **Manuelle Ingestion erforderlich** - `Ctrl+Shift+P` → "Ingest Documentation"

**Warum?**
- 5D Database Plugin läuft in einem separaten VS Code-Fenster/Prozess
- Keine automatische Datei-Überwachung (File Watcher) implementiert
- Ingestion muss manuell ausgelöst werden

### Szenario 2: Beide Plugins im gleichen Workspace

**Ablauf:**
1. Beide Plugins sind im gleichen VS Code-Workspace installiert
2. Noyrax generiert `docs/` (z.B. via Command)
3. 5D Database Plugin kann `docs/` finden (via `DocsPathResolver`)

**Auswirkung:**
- ✅ **5D Database Plugin findet `docs/` automatisch**
- ⚠️ **Aber: Ingestion muss trotzdem manuell ausgeführt werden**
- ✅ **Ingestion kann via Command ausgeführt werden**

### Szenario 3: Verschiedene Workspaces

**Ablauf:**
1. Noyrax läuft in Workspace A
2. 5D Database Plugin läuft in Workspace B
3. Beide nutzen den gleichen `docs/` Ordner (z.B. in einem gemeinsamen Parent-Verzeichnis)

**Auswirkung:**
- ✅ **5D Database Plugin findet `docs/` via Parent-Directory-Suche**
- ⚠️ **Aber: Ingestion muss manuell ausgeführt werden**
- ✅ **Ingestion kann via CLI ausgeführt werden**

## Aktuelle Synchronisation

### Manuelle Ingestion

**Via VS Code Command:**
```
Ctrl+Shift+P → "Ingest Documentation"
```

**Via CLI:**
```bash
# Inkrementelle Ingestion (nur geänderte Dateien)
noyrax-5d-database ingest <workspace-root>

# Vollständige Ingestion (alle Dateien neu)
noyrax-5d-database ingest <workspace-root> --full
```

### Hash-basierte Änderungserkennung

**Funktionsweise:**
- Jede Datei hat einen Content-Hash
- Bei inkrementeller Ingestion werden nur geänderte Dateien aktualisiert
- Hash-Vergleich identifiziert Änderungen

**Vorteil:**
- ⚡ Schnell - nur geänderte Dateien werden verarbeitet
- 💰 Effizient - keine unnötigen API-Calls

**Nachteil:**
- ⚠️ Manuelle Auslösung erforderlich
- ⚠️ Keine automatische Synchronisation

## Automatische Synchronisation (geplant)

### Real-time Updates (File Watcher)

**Status:** ⚠️ **Geplant, aber noch nicht implementiert**

**Geplante Funktionalität:**
- File Watcher für `docs/` Ordner
- Automatische Ingestion bei Änderungen
- Konfigurierbare Update-Intervalle

**Siehe:** `IMPROVEMENT_ROADMAP.md` - Priorität 2.3

### Workflow mit File Watcher (zukünftig)

```
Noyrax generiert docs/ 
  → File Watcher erkennt Änderung
  → Automatische Ingestion ausgelöst
  → SQLite-DBs aktualisiert
  → Embeddings aktualisiert (falls nötig)
```

## Best Practices

### Workflow für neue Dokumentation

1. **Noyrax ausführen** - `docs/` generieren
2. **Ingestion ausführen** - `Ctrl+Shift+P` → "Ingest Documentation"
3. **Verifikation** - Prüfen ob SQLite-DBs aktualisiert wurden

### Workflow für Updates

1. **Code ändern**
2. **Noyrax ausführen** - `docs/` neu generieren
3. **Ingestion ausführen** - Inkrementelle Ingestion (automatisch nur geänderte Dateien)

### Workflow für verschiedene Workspaces

1. **Gemeinsamen `docs/` Ordner nutzen** - Z.B. in Parent-Verzeichnis
2. **Noyrax in Workspace A** - Generiert `docs/`
3. **5D Database Plugin in Workspace B** - Findet `docs/` via Parent-Suche
4. **Ingestion ausführen** - Via CLI oder Command

## Daten-Weitergabe

### Kann ich Daten an Noyrax weitergeben?

**Kurze Antwort:** ❌ **Nein, nicht direkt**

**Warum?**
- Noyrax generiert `docs/` aus dem **Source-Code**
- 5D Database Plugin liest `docs/` und speichert in **SQLite-DBs**
- Die Datenfluss-Richtung ist: **Code → Noyrax → docs/ → 5D Database Plugin**

**Aber:**
- ✅ **Indirekt über `docs/`** - Wenn Noyrax `docs/` liest (z.B. für Validierung)
- ✅ **Über ADRs** - ADRs in `docs/adr/` werden von beiden Systemen genutzt
- ✅ **Über Change Reports** - Change Reports in `docs/system/CHANGE_REPORT.md`

### Datenfluss-Diagramm

```
┌─────────────────────────────────────────────────────────────┐
│                    DATENFLUSS                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Source Code                                                │
│      ↓                                                      │
│  Noyrax (Documentation System)                             │
│      ↓                                                      │
│  docs/ Ordner (Markdown, JSONL)                            │
│      ↓                                                      │
│  5D Database Plugin                                         │
│      ↓                                                      │
│  SQLite-DBs (.database-plugin/)                            │
│      ↓                                                      │
│  MCP-Server / CLI-Tools                                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Wichtig:** Die Datenfluss-Richtung ist **einseitig** - von Code über Noyrax zu 5D Database Plugin.

## Troubleshooting

### Problem: 5D Database Plugin findet `docs/` nicht

**Lösung:**
1. Prüfe ob `docs/` im Workspace-Root existiert
2. Prüfe ob `docs/` in Parent-Verzeichnissen existiert (max. 5 Ebenen)
3. Prüfe `DocsPathResolver.findDocsDirectory()` Logs

### Problem: Ingestion aktualisiert Daten nicht

**Lösung:**
1. Prüfe ob `docs/` Dateien geändert wurden (Hash-Vergleich)
2. Führe vollständige Ingestion aus: `--full` Flag
3. Prüfe Ingestion-Logs für Fehler

### Problem: Verschiedene Workspaces

**Lösung:**
1. Nutze gemeinsamen `docs/` Ordner (z.B. in Parent-Verzeichnis)
2. Führe Ingestion via CLI aus: `noyrax-5d-database ingest <workspace-root>`
3. Prüfe ob `DocsPathResolver` den `docs/` Ordner findet

## Zukünftige Verbesserungen

### Geplant (siehe IMPROVEMENT_ROADMAP.md)

1. **Real-time Updates (File Watcher)** - Priorität 2.3
   - Automatische Ingestion bei `docs/` Änderungen
   - Konfigurierbare Update-Intervalle

2. **Git Hooks** - Priorität 5.2
   - Automatische Ingestion bei Commits
   - Integration mit Git-Workflow

3. **CI/CD Integration** - Priorität 5.1
   - Automatische Ingestion in CI/CD-Pipelines
   - GitHub Actions / GitLab CI Templates

## Verweise

- `SETUP_NEW_PROJECT.md` - Vollständiger Setup-Workflow
- `IMPROVEMENT_ROADMAP.md` - Geplante Verbesserungen
- `src/core/docs-path-resolver.ts` - `docs/` Ordner-Suche
- `src/services/ingestion-orchestrator.ts` - Ingestion-Logik

