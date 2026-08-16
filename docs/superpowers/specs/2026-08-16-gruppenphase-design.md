# Gruppenphase + KO-Playoff — Design

## Context

`dart-turnier.jsx` unterstützt bisher nur Single Elimination. Nach der
Engine-Konsolidierung (Stage 1: Match-Scoring läuft über `src/engine.js`,
siehe `2026-08-16` Merge) ist das nächste Roadmap-Item eine Gruppenphase
mit anschließendem KO-Playoff — konfigurierbare Gruppenzahl/Advance-Count,
getrennte Regeln (Legs, Single/Double Out) pro Phase.

**Zwei getrennte Ziele, nicht vermischen:**

- **Scope 1 (das reale Turnier):** K.-o.-Modus, muss zuverlässig laufen,
  wird durch dieses Feature **nicht angefasst**.
- **Scope 2 (Kommerzialisierungs-Richtung):** dieses Feature — additiv,
  eigener Code-Pfad, kein Eingriff in Scope 1.

Motivation fürs Design: Gruppentabellen, Advancing-Logik und
Phasenübergänge sind exakt das, was `src/tournament.js` +
`src/formats/round-robin.js` + `src/formats/single-elim.js` schon
getestet können (687+ Tests). Die gleiche Lehre wie bei Stage 1 —
nicht nochmal von Hand nachbauen, was schon existiert.

## Scope

Genau **2 feste Phasen**: Gruppenphase → KO-Playoff. Kein Drag&Drop,
keine beliebige Phasenkette, kein Swiss/Double-Elim, kein Multi-Board.
Das bleibt auf der Roadmap für später.

## Architektur

**Additiver zweiter Code-Pfad**, ausgewählt per `config.format`
(`"single_elim"` default | `"groups_ko"`):

- `format:"single_elim"` → **exakt der heutige Code**, unverändert
  (`buildBracket`/`propagateBracket`/`MatchCard`/`TvMatchCard`/`bracket.teams[i]`-Indexmodell).
- `format:"groups_ko"` → **komplett neuer Pfad** auf Basis von
  `tournament.js` (`createTournament`/`startPhase`/`reportMatchResult`/
  `advancePhase`/`getAllGroupTables`/`getAdvancingParticipants`).
  Eigenes Rendering, eigenes Datenmodell (Teilnehmer-IDs statt
  Team-Index, wie in `tournament.js` üblich). Keine gemeinsamen
  Funktionen mit dem Single-Elim-Pfad außer den reinen UI-Bausteinen
  (Buttons, Modals, Theme).

**Zwei-Ebenen-Muster wie in Stage 1:** `tournament.js` kennt nur
Ergebnisse (`reportMatchResult(state, matchId, {winner, score1, score2})`),
keine Dart-Regeln. Jedes einzelne Match bekommt weiterhin ein eigenes
`match.game` (Engine-Instanz aus `src/engine.js`) für die Live-Punktevergabe
— erzeugt, sobald ein Match zum ersten Mal geöffnet wird (lazy, nicht wie
in Stage 1 eager beim Bracket-Bau, weil in `tournament.js`s Struktur nicht
jedes Match von Anfang an feststehende Gegner hat). Erst wenn
`match.game.phase==='match_complete'`, wird das Ergebnis per
`reportMatchResult` in den Tournament-State geschrieben, was Tabelle/
Advancing/Playoff-Aufbau auslöst.

## Gruppen-Auslosung

`round-robin.js`s `generateGroups` verteilt Teilnehmer nach `seeding`
(`'snake'`/`'manual'`), randomisiert selbst nicht (wie bereits bei
Single-Elim festgestellt). Gleiche Lösung wie beim K.-o.-Draw: Team-Namen
vor `generateGroups` mit dem bestehenden `shuffle()` mischen, damit die
Gruppenzuteilung zufällig ist statt Eingabereihenfolge.

## Setup-Screen

- Format-Wahl (Radio/Toggle): „K.-o." vs. „Gruppenphase + Playoff"
- Bei Gruppenphase zusätzlich:
  - Gruppenzahl (Stepper, wie der heutige Team-Anzahl-Stepper)
  - Advance-Count pro Gruppe (Stepper)
  - **Zwei Regel-Blöcke** statt einem: „Gruppenphase" (Best of N,
    Single/Double Out) und „KO-Playoff" (Best of N, Single/Double Out,
    Platz-3-Toggle wie heute)

## Neue Komponenten

- `GroupOverview` — Gruppentabellen (Platz/Sieg-Niederlage-Unentschieden/
  Punkte/Legs) aus `getAllGroupTables(tournamentState)`, ein Block pro
  Gruppe, analog zur heutigen `StatsView`-Kartenoptik.
- `GroupMatchCard` — wie `MatchCard`, aber auf `tournament.js`s
  Match-Shape (`p1`/`p2`-IDs statt `t1`/`t2`-Indizes) statt heutigem Modell.
- Phasenübergang: Sobald `isPhaseComplete(state)` für die Gruppenphase,
  Button „Zur KO-Phase" → `advancePhase(state)` baut automatisch den
  KO-Bracket aus den Top-N pro Gruppe.
- TV: neue Gruppentabellen-Ansicht während Phase 1, automatischer
  Wechsel zur bestehenden Bracket-TV-Optik (adaptiert aufs neue
  Match-Modell) sobald Phase 2 läuft — gleiches Grundprinzip wie
  `TvAuto` heute, aber phasenbewusst.

## Persistenz

`save()`/`load()` bleiben wie sie sind — der bestehende `bracket`-Schlüssel/
-Shape für `single_elim` wird **nicht verändert** (kein Schema-Bruch für
bestehende Single-Elim-Spielstände, anders als beim v2→v3-Bump bei Stage 1).
Für `groups_ko` wird ein eigenständiges, ebenfalls rein JSON-serialisierbares
Tournament-State-Objekt unter einem eigenen Feld gespeichert.

## Testing

Gleiches Vorgehen wie Stage 1: kein neuer Unit-Test-Harness für
`dart-turnier.jsx` (Prototyp, passt zum bisherigen Stand). Verifikation
via Playwright-E2E gegen den `dist/`-Build: Format wählen, Gruppen
generieren, genug Gruppenspiele bis Phasenende deterministisch
durchspielen, Phasenübergang auslösen, KO-Phase bis Sieger durchspielen,
TV-Ansichten beider Phasen prüfen — ohne Konsolen-/Seitenfehler.
`npm test` (`src/`, 157 Tests) bleibt unverändert grün, da keine
Änderungen an `src/` nötig sind.

## Out of scope (bleibt auf der Roadmap)

Mehr als 2 Phasen, Swiss, Double-Elim, Drag&Drop-Phasenbuilder,
Multi-Board, Spieler-Datenbank über Turniere hinweg, Cross-Device-Sync.
