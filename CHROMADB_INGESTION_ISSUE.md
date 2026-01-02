# ChromaDB Ingestion Issue

## Problem

Bei der Ingestion wird ChromaDB nicht korrekt initialisiert oder verwendet.

## Ablauf der Ingestion

1. **IngestionOrchestrator.ingestFull()** ruft:
   - `migrationManager.migrate('V')` - erstellt `vectors.db` SQLite-Datenbank
   - `embeddingPipeline.syncEmbeddings(pluginId)` - synchronisiert Embeddings

2. **EmbeddingPipeline.syncDimension()** ruft:
   - `dbManager.getDatabase('V')` - öffnet SQLite `vectors.db`
   - `getDatabase('V')` sollte ChromaDB initialisieren (via `VectorDatabaseFactory.create()`)
   - Embeddings werden in SQLite `embeddings` Tabelle gespeichert
   - `vectorDb.upsertEmbedding()` sollte Embeddings in ChromaDB speichern

## Mögliche Probleme

### Problem 1: ChromaDB-Server läuft nicht
- ChromaDB wird als Server auf `localhost:8000` erwartet
- Wenn Server nicht läuft, schlägt Initialisierung fehl
- `chromaDb.initialize()` setzt `this.available = false`
- Embeddings werden nur in SQLite gespeichert (Fallback auf Cosine Similarity)

### Problem 2: Initialisierung erfolgt zu spät
- ChromaDB wird nur initialisiert, wenn `getDatabase('V')` aufgerufen wird
- Aber `getVectorDatabase()` wird erst DANACH aufgerufen
- Timing-Problem möglich

### Problem 3: Collection wird nicht erstellt
- `chromaDb.initialize()` erstellt/holt Collection nur wenn Client erfolgreich initialisiert wurde
- Wenn Initialisierung fehlschlägt, wird keine Collection erstellt

## Lösung

### Bereits implementiert:
- ✅ Logging in `EmbeddingPipeline.syncDimension()` hinzugefügt
- ✅ Logging in `vectorDb.upsertEmbedding()` hinzugefügt
- ✅ ChromaDB wird bei `getDatabase('V')` initialisiert

### Was noch fehlt:
- ⚠️ ChromaDB-Server muss laufen (`chroma run --host localhost --port 8000`)
- ⚠️ Initialisierung könnte fehlschlagen ohne Fehler-Logging

## Test

Um zu testen, ob ChromaDB bei Ingestion verwendet wird:

1. **ChromaDB-Server starten:**
   ```bash
   chroma run --host localhost --port 8000
   ```

2. **Ingestion ausführen:**
   ```bash
   npm run ingest
   ```

3. **Logs prüfen:**
   - Sollte sehen: `[ChromaDbVectorDatabase] Initialized ChromaDB client (server: localhost:8000)`
   - Sollte sehen: `[ChromaDbVectorDatabase] ChromaDB initialized successfully.`
   - Sollte sehen: `[EmbeddingPipeline] Vector database available: ChromaDbVectorDatabase`
   - Sollte sehen: `[EmbeddingPipeline] Synced embedding <id> to vector database (ChromaDbVectorDatabase)`

4. **ChromaDB prüfen:**
   - Collection `embeddings` sollte existieren
   - Embeddings sollten in ChromaDB gespeichert sein

## Status

- ✅ Code-Integration: Vollständig implementiert
- ⚠️ Server-Anforderung: ChromaDB-Server muss laufen
- ⚠️ Logging: Erweitert für besseres Debugging

