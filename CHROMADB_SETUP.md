# ChromaDB Setup für Windows

ChromaDB wird auf Windows als Vektordatenbank verwendet, da SQLite VSS auf Windows nicht unterstützt wird.

## Installation

### ChromaDB Server Mode (empfohlen)

1. **Python installieren** (Version 3.9 oder höher)
   - Download von: https://www.python.org/downloads/

2. **ChromaDB installieren**
   ```bash
   pip install chromadb
   ```

3. **ChromaDB Server starten**
   ```bash
   chroma run --host localhost --port 8000
   ```
   
   **Wichtig:** Der Server muss laufen, damit die VS Code Extension ChromaDB verwenden kann.
   Sie können den Server im Hintergrund laufen lassen oder als Windows Service einrichten.

4. **npm Package installieren** (JavaScript Client)
   ```bash
   cd 5d-database-plugin
   npm install chromadb
   ```

**Hinweis:** Die ChromaDB-Implementierung verbindet sich mit `http://localhost:8000`.
Stellen Sie sicher, dass der Server läuft, bevor Sie die Extension verwenden.

## Verwendung

Die ChromaDB-Integration ist automatisch aktiviert auf Windows. 
Das System verwendet automatisch ChromaDB, wenn:
- `process.platform === 'win32'`
- ChromaDB-Package installiert ist
- ChromaDB erfolgreich initialisiert werden kann

Falls ChromaDB nicht verfügbar ist, fällt das System automatisch auf Cosine Similarity zurück.

## Troubleshooting

### ChromaDB kann nicht initialisiert werden

- Prüfen Sie, ob Python installiert ist: `python --version`
- Prüfen Sie, ob ChromaDB installiert ist: `pip list | grep chromadb`
- Prüfen Sie, ob das npm Package installiert ist: `npm list chromadb`

### ChromaDB Server läuft nicht

Wenn Sie ChromaDB als Server verwenden möchten:
1. Starten Sie den Server: `chroma run --host localhost --port 8000`
2. Stellen Sie sicher, dass Port 8000 frei ist

### Embedded Mode Probleme

Wenn Embedded Mode nicht funktioniert:
- Prüfen Sie, ob Python auf dem PATH ist
- Prüfen Sie, ob `chromadb` Python Package installiert ist
- Prüfen Sie die Berechtigungen für `.database-plugin/chromadb/`

## Weitere Informationen

- [ChromaDB Dokumentation](https://docs.trychroma.com/)
- [ChromaDB GitHub](https://github.com/chroma-core/chroma)

