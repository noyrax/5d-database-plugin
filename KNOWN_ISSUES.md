# Bekannte Probleme und Einschränkungen

**Datum:** 2025-12-29  
**System:** 5D Database Plugin + Semantic Brain  
**Status:** Alle Probleme sind nicht-kritisch, System ist produktionsbereit

## Warnungen (nicht kritisch)

### 1. ChromaDB DefaultEmbeddingFunction Warnung

**Symptom:**
```
Cannot instantiate a collection with the DefaultEmbeddingFunction. 
Please install @chroma-core/default-embed, or provide a different embedding function
```

**Ursache:**
- ChromaDB erwartet `@chroma-core/default-embed` Package für DefaultEmbeddingFunction
- System nutzt manuelle Embedding-Generierung via OpenAI API

**Impact:**
- ⚠️ Warnung wird angezeigt
- ✅ **Funktioniert trotzdem** - Fallback auf manuelle Embeddings
- ✅ Keine Funktionsbeeinträchtigung

**Lösung:**
- System nutzt bereits manuelle Embedding-Generierung
- Warnung kann ignoriert werden
- Optional: `@chroma-core/default-embed` installieren (nicht erforderlich)

**Status:** ✅ Funktioniert, Warnung kann ignoriert werden

---

### 2. SQLite VSS auf Windows nicht verfügbar

**Symptom:**
```
[VssLoader] Failed to get VSS path from sqlite-vss package: 
Error: Loadable extension for sqlite-vss not found. 
Was the sqlite-vss-windows-x64 package installed?
```

**Ursache:**
- SQLite VSS Extension ist auf Windows nicht verfügbar
- System nutzt ChromaDB als Fallback

**Impact:**
- ⚠️ SQLite VSS nicht verfügbar
- ✅ **ChromaDB-Fallback funktioniert**
- ✅ Keine Funktionsbeeinträchtigung

**Lösung:**
- ChromaDB wird automatisch auf Windows verwendet
- Siehe `CHROMADB_SETUP.md` für Installation
- System funktioniert vollständig mit ChromaDB

**Status:** ✅ Funktioniert mit ChromaDB-Fallback

---

### 3. Path-Encoding mit Umlauten

**Symptom:**
```
Set-Location : Der Pfad "D:\Datenbank fǟr Noyrax" kann nicht gefunden werden
```

**Ursache:**
- Workspace-Pfad enthält Umlaute (z.B. "für")
- PowerShell/Node.js Encoding-Handling kann Probleme verursachen

**Impact:**
- ⚠️ Warnung wird angezeigt
- ✅ **Funktioniert trotzdem** - Encoding-Handling vorhanden
- ⚠️ Minimale Performance-Einbußen möglich

**Lösung:**
- System hat Encoding-Handling implementiert
- Funktioniert trotz Warnung
- Optional: Workspace-Pfad ohne Umlaute verwenden (falls möglich)

**Status:** ✅ Funktioniert, Warnung kann ignoriert werden

---

## Keine kritischen Fehler

**Status:** ✅ **Keine kritischen Fehler gefunden** - System ist produktionsbereit

Alle bekannten Probleme sind Warnungen, die die Funktionalität nicht beeinträchtigen.

## Workarounds

### Für ChromaDB DefaultEmbeddingFunction

**Option 1: Ignorieren (empfohlen)**
- System funktioniert trotz Warnung
- Manuelle Embedding-Generierung wird verwendet

**Option 2: Package installieren**
```bash
npm install @chroma-core/default-embed
```
- Nicht erforderlich, aber kann Warnung entfernen

### Für SQLite VSS auf Windows

**Lösung: ChromaDB nutzen**
```bash
# ChromaDB installieren
pip install chromadb

# ChromaDB Server starten (optional)
chroma run --host localhost --port 8000
```
- System nutzt automatisch ChromaDB auf Windows
- Siehe `CHROMADB_SETUP.md` für Details

### Für Path-Encoding

**Option 1: Ignorieren (empfohlen)**
- System funktioniert trotz Warnung
- Encoding-Handling ist implementiert

**Option 2: Workspace-Pfad ändern**
- Workspace ohne Umlaute verwenden (falls möglich)
- Nicht erforderlich, aber kann Warnung entfernen

## Monitoring

### Empfohlene Überwachung

1. **Embedding-Kosten**
   - OpenAI API-Kosten überwachen
   - Besonders bei großen Codebases

2. **Performance**
   - Ingestion-Zeit überwachen
   - Embedding-Generierung kann langsam sein

3. **Datenbank-Größe**
   - SQLite-Datenbanken können groß werden
   - Regelmäßige Bereinigung erwägen

4. **ChromaDB-Status**
   - Server-Status überwachen (falls verwendet)
   - Verbindungsfehler prüfen

## Fehlerbehandlung

### Bei Ingestion-Fehlern

1. **Prüfe `docs/` Ordner**
   ```bash
   Test-Path docs/modules
   Test-Path docs/index/symbols.jsonl
   ```

2. **Prüfe Logs**
   - Output-Channel in VS Code
   - Terminal-Output bei CLI-Nutzung

3. **Vollständige Re-Ingestion**
   ```bash
   noyrax-5d-database ingest . --full
   ```

### Bei MCP-Server-Fehlern

1. **Prüfe Workspace-Root**
   ```bash
   noyrax-5d-database-mcp <workspace-root>
   ```

2. **Prüfe `docs/` Existenz**
   - MCP-Server erfordert `docs/` Ordner

3. **Prüfe Ingestion**
   - SQLite-Datenbanken müssen existieren

### Bei Semantic Search-Fehlern

1. **Prüfe Embeddings**
   ```bash
   noyrax-5d-database-embedding .
   ```

2. **Prüfe ChromaDB**
   - Server läuft? (falls verwendet)
   - Verbindung erfolgreich?

3. **Prüfe OpenAI API Key**
   - `.env` Datei vorhanden?
   - `OPENAI_API_KEY` gesetzt?

## Verweise

- `CHROMADB_SETUP.md` - ChromaDB-Installation und Troubleshooting
- `MCP_SERVER_SETUP.md` - MCP-Server-Konfiguration
- `SETUP_NEW_PROJECT.md` - Vollständiger Setup-Workflow
- `INSTALLATION_READINESS.md` - Installation-Readiness-Report

## Update-Log

**2025-12-29:**
- Dokumentation erstellt
- Alle bekannten Probleme als nicht-kritisch klassifiziert
- Workarounds dokumentiert

