# ADR-Vorschläge für fehlende Dokumentation

**Datum:** 2025-12-29  
**Basis:** Gap Analysis Ergebnisse

## Status-Übersicht

### ✅ Bereits gut dokumentiert

| Modul | Dependencies | ADRs | Status |
|-------|--------------|------|--------|
| `context-builder.ts` | 15 | ADR-025, ADR-035 | ✅ Gut dokumentiert |
| `embedding-pipeline.ts` | 15 | ADR-021, ADR-030, ADR-032 | ✅ Gut dokumentiert |
| `semantic-search-api.ts` | 5 | ADR-024, ADR-030, ADR-032 | ✅ Gut dokumentiert |
| `semantic-discovery.ts` | 5 | ADR-028 | ✅ Dokumentiert |

### ⚠️ Brauchen mehr Dokumentation

| Rang | Modul | Dependencies | Aktuelle ADRs | Gap-Score | Empfehlung |
|------|-------|--------------|---------------|-----------|------------|
| 1 | `learning-path-api.ts` | 10 | ADR-026 | 10 | ⚠️ **Hoch** - Erweitern oder neues ADR |
| 2 | `navigation-builder.ts` | 10 | ADR-023 | 10 | ⚠️ **Hoch** - Erweitern oder neues ADR |
| 3 | `self-explanation-api.ts` | 8 | ADR-026 | 6 | ⚠️ **Mittel** - Erweitern |
| 4 | `importance-scorer.ts` | 7 | ADR-022 | 4 | ⚠️ **Niedrig** - Könnte erweitert werden |

---

## Vorschläge für neue ADRs

### Priorität 1: Module mit 10 Dependencies

#### 1.1 `learning-path-api.ts` - Erweiterte Dokumentation

**Aktueller Status:**
- ADR-026: Self-Explanation und Learning Path (gemeinsam mit `self-explanation-api.ts`)
- Gap-Score: 10 (10 Dependencies, 1 ADR)

**Vorschlag: Neues ADR-036: Learning Path API - Dependency-basierte Lernpfade**

**Inhalt:**
- **Kontext:** Wie werden Lernpfade aus Dependency-Graph generiert?
- **Entscheidung:** 
  - Dependency-basierte Pfad-Generierung
  - Entry Points als Startpunkte
  - Semantic Search für Topic-Findung
- **Konsequenzen:**
  - Vorteile: Strukturierte Lernpfade, automatische Generierung
  - Nachteile: Abhängig von Dependency-Graph-Qualität
- **Alternativen:**
  - Manuelle Lernpfade (zu aufwändig)
  - KI-generierte Pfade (nicht deterministisch)

**Oder:** ADR-026 erweitern um spezifische Details zu `learning-path-api.ts`

#### 1.2 `navigation-builder.ts` - Erweiterte Dokumentation

**Aktueller Status:**
- ADR-023: Navigation Metadata - Entry Points, Clusters, ADR-Links
- Gap-Score: 10 (10 Dependencies, 1 ADR)

**Vorschlag: ADR-023 erweitern oder neues ADR-037: Navigation Builder - Automatische Metadata-Generierung**

**Inhalt:**
- **Kontext:** Wie werden Navigation Metadata automatisch generiert?
- **Entscheidung:**
  - Entry Points: Importance Score + Dependency-Analyse
  - Clusters: Verzeichnisstruktur-basiert
  - ADR-Links: Via AdrFileMapping
- **Konsequenzen:**
  - Vorteile: Automatische Generierung, konsistente Navigation
  - Nachteile: Clustering basiert nur auf Verzeichnisstruktur
- **Alternativen:**
  - Semantisches Clustering (komplexer, langsamer)
  - Manuelle Metadata (wartungsaufwändig)

**Oder:** ADR-023 erweitern um Implementierungsdetails zu `navigation-builder.ts`

### Priorität 2: Module mit 7-8 Dependencies

#### 2.1 `self-explanation-api.ts` - Erweiterte Dokumentation

**Aktueller Status:**
- ADR-026: Self-Explanation und Learning Path (gemeinsam mit `learning-path-api.ts`)
- Gap-Score: 6 (8 Dependencies, 1 ADR)

**Vorschlag: ADR-026 erweitern um Self-Explanation-spezifische Details**

**Neue Abschnitte für ADR-026:**
- **Self-Explanation API Details:**
  - Entry Points Identifikation
  - System-Übersicht Generierung
  - Architecture ADRs Integration
- **Unterschied zu Learning Path:**
  - Self-Explanation: System-Übersicht (statisch)
  - Learning Path: Geführter Pfad (dynamisch)

#### 2.2 `importance-scorer.ts` - Erweiterte Dokumentation

**Aktueller Status:**
- ADR-022: Importance Scoring - PageRank und Betweenness Centrality
- Gap-Score: 4 (7 Dependencies, 1 ADR)

**Vorschlag: ADR-022 erweitern um Implementierungsdetails**

**Neue Abschnitte für ADR-022:**
- **Implementierungsdetails:**
  - PageRank-Algorithmus: Iterativ bis Konvergenz
  - Betweenness Centrality: Vereinfachte Implementierung (O(n))
  - Score-Kombination: 70% PageRank + 30% Betweenness
- **Performance:**
  - Incremental Updates nur bei Dependency-Änderungen
  - Caching-Strategie

---

## Empfohlene Vorgehensweise

### Option A: Neue ADRs erstellen (empfohlen für Priorität 1)

**Vorteile:**
- Klare Trennung der Themen
- Spezifische Dokumentation pro Modul
- Bessere Auffindbarkeit

**Nachteile:**
- Mehr ADRs zu pflegen
- Potenzielle Redundanz

**Empfehlung für:**
- `learning-path-api.ts` → ADR-036
- `navigation-builder.ts` → ADR-037 (oder ADR-023 erweitern)

### Option B: Bestehende ADRs erweitern (empfohlen für Priorität 2)

**Vorteile:**
- Weniger ADRs
- Zusammenhängende Themen zusammen

**Nachteile:**
- Längere ADRs
- Möglicherweise weniger spezifisch

**Empfehlung für:**
- `self-explanation-api.ts` → ADR-026 erweitern
- `importance-scorer.ts` → ADR-022 erweitern

---

## Konkrete ADR-Vorschläge

### ADR-036: Learning Path API - Dependency-basierte Lernpfade

**Status:** Proposed

**Kontext:**
- LLM-Agenten benötigen geführte Lernpfade durch das System
- Dependency-Graph liefert natürliche Abhängigkeits-Struktur
- Entry Points als Startpunkte für Lernpfade

**Entscheidung:**
- **LearningPathApi** (`src/api/learning-path-api.ts`):
  - Generiert Lernpfade basierend auf Dependency-Graph
  - Nutzt Entry Points als Startpunkte
  - Semantic Search für Topic-Findung
  - Dependency-Pfad-Generierung (From → To)

**Konsequenzen:**
- ✅ Automatische Lernpfad-Generierung
- ✅ Strukturierte Navigation durch System
- ⚠️ Abhängig von Dependency-Graph-Qualität
- ⚠️ O(n) für Semantic Search + Dependency-Pfad

**Alternativen:**
- Manuelle Lernpfade (zu aufwändig)
- KI-generierte Pfade (nicht deterministisch)

**Verweise:**
- ADR-026: Self-Explanation und Learning Path (gemeinsam dokumentiert)
- ADR-024: Semantic Search API (nutzt für Topic-Findung)
- ADR-023: Navigation Metadata (nutzt Entry Points)

---

### ADR-037: Navigation Builder - Automatische Metadata-Generierung

**Status:** Proposed

**Kontext:**
- Navigation Metadata (Entry Points, Clusters, ADR-Links) müssen automatisch generiert werden
- Importance Scores liefern Basis für Entry Point Identifikation
- AdrFileMapping liefert ADR-Links

**Entscheidung:**
- **NavigationBuilder** (`src/services/navigation-builder.ts`):
  - Entry Points: Importance Score > 0.1 + keine eingehenden Dependencies
  - Clusters: Verzeichnisstruktur-basiert (`cluster:{directory_path}`)
  - ADR-Links: Via `AdrFileMapping` aus W-Dimension

**Konsequenzen:**
- ✅ Automatische Generierung
- ✅ Konsistente Navigation
- ⚠️ Clustering basiert nur auf Verzeichnisstruktur (einfach)
- ⚠️ Entry Points möglicherweise nicht optimal

**Alternativen:**
- Semantisches Clustering (komplexer, langsamer)
- Manuelle Metadata (wartungsaufwändig)

**Verweise:**
- ADR-023: Navigation Metadata (High-Level-Entscheidung)
- ADR-022: Importance Scoring (nutzt für Entry Points)
- ADR-025: Deterministic Context Builder (nutzt Navigation Metadata)

---

## Zusammenfassung

### Sofort umsetzen (Priorität 1)

1. **ADR-036: Learning Path API** (neu)
   - Dokumentiert `learning-path-api.ts` spezifisch
   - Ergänzt ADR-026

2. **ADR-037: Navigation Builder** (neu) ODER **ADR-023 erweitern**
   - Dokumentiert `navigation-builder.ts` spezifisch
   - Ergänzt ADR-023

### Später umsetzen (Priorität 2)

3. **ADR-026 erweitern** um Self-Explanation-spezifische Details
4. **ADR-022 erweitern** um Implementierungsdetails

### Optional (Priorität 3)

- Weitere Module mit 5 Dependencies prüfen
- Gap Analysis regelmäßig ausführen

---

**Nächste Schritte:**
1. ADR-036 erstellen (Learning Path API)
2. ADR-037 erstellen (Navigation Builder) ODER ADR-023 erweitern
3. ADR-026 erweitern (Self-Explanation Details)
4. ADR-022 erweitern (Importance Scorer Details)
5. Re-Ingestion ausführen (File-Mappings aktualisieren)
6. Gap Analysis erneut ausführen (Verifikation)

