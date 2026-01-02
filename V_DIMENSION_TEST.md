# V-Dimension Test Script

Dieses Script testet die V-Dimension (Vektordatenbank) und prüft:
- V-Dimension Datenbank-Öffnung
- VSS Extension Loading
- Embeddings-Zählung
- VSS Virtual Table Status

## Verwendung

### 1. Kompilieren

```powershell
cd 5d-database-plugin
npm run compile
```

### 2. Test ausführen

```powershell
# Mit npm script:
npm run test:v-dimension "D:\Datenbank für Noyrax"

# Oder direkt:
node out/cli/test-v-dimension.js "D:\Datenbank für Noyrax"
```

## Was wird getestet?

1. **MultiDbManager Initialisierung**
   - Plugin ID
   - Database Directory

2. **Migrationen**
   - V-Dimension Migration wird ausgeführt

3. **V-Dimension Öffnen**
   - Datenbank wird geöffnet
   - VSS Extension wird geladen

4. **VSS Manager Status**
   - Prüft ob VSS verfügbar ist
   - Zeigt Status an

5. **Database File**
   - Prüft ob `vectors.db` existiert
   - Zeigt Dateigröße

6. **Tabellen**
   - Listet alle Tabellen auf
   - Prüft ob `embeddings_vss` existiert

7. **Embeddings**
   - Zählt alle Embeddings
   - Gruppiert nach Dimension

8. **VSS Virtual Table**
   - Prüft ob VSS Table existiert
   - Zählt VSS Rows

9. **Test Summary**
   - Zeigt Gesamtstatus
   - Gibt nächste Schritte an

## Beispiel-Output

```
=== V-Dimension Test ===
Workspace root: D:\Datenbank für Noyrax

✓ OpenAI API key loaded from .env file

1. Initializing MultiDbManager...
   Plugin ID: abc123def4567890
   Database directory: D:\Datenbank für Noyrax\.database-plugin

2. Running migrations...
   ✓ V-Dimension migration completed

3. Opening V-Dimension database...
   ✓ V-Dimension database opened

4. Checking VSS Manager...
   ✓ VSS Manager available
   ✓ VSS Extension loaded successfully

5. Checking database file...
   ✓ vectors.db exists
   Size: 1234.56 KB

6. Checking database tables...
   Found 4 tables:
   - embeddings
   - embeddings_vss
   - importance_scores
   - navigation_metadata

7. Checking VSS Virtual Table...
   ✓ embeddings_vss virtual table exists
   VSS rows: 150

8. Counting embeddings...
   Total embeddings: 150
   By dimension:
   - X: 50
   - Y: 60
   - Z: 20
   - W: 15
   - T: 5

=== Test Summary ===
✓ V-Dimension database: EXISTS
✓ VSS Extension: LOADED
✓ Embeddings: 150 total
✓ VSS Virtual Table: EXISTS

✓ V-Dimension is ready for semantic search!
```

## Troubleshooting

### VSS Extension nicht verfügbar

Wenn VSS nicht verfügbar ist:
- System nutzt automatisch Fallback (Cosine Similarity)
- Funktioniert, ist aber langsamer
- Prüfe Logs für Details

### Keine Embeddings gefunden

Wenn keine Embeddings gefunden werden:
1. Führe Ingestion aus:
   ```powershell
   # VS Code Command: "5d-database.ingest"
   # Oder CLI:
   node out/cli/ingest-cli.js "D:\Datenbank für Noyrax" --full
   ```

2. Prüfe OpenAI API Key:
   - Muss in `.env` Datei sein
   - Format: `OPENAI_API_KEY=sk-...`

### VSS Virtual Table nicht erstellt

Wenn `embeddings_vss` nicht existiert:
- VSS Extension konnte nicht geladen werden
- System nutzt Fallback
- Prüfe Logs für Fehlerdetails

## Nächste Schritte

Nach erfolgreichem Test:

1. **Semantic Search testen:**
   - MCP-Tool `semantic_discovery` nutzen
   - Oder VS Code Command `5d-database.search`

2. **Embeddings generieren:**
   - Ingestion ausführen
   - Embeddings werden automatisch in VSS synchronisiert

3. **Performance prüfen:**
   - Mit VSS: Schnell (index-basiert)
   - Ohne VSS: Langsamer (Cosine Similarity)

