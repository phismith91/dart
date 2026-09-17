# Gruppenphase + gestaffeltes Legs-Format fürs reale Turnier — Design

## Entscheidung (final)

Nach Diskussion übers Sätze-Konzept (schwer verständlich, auch für
Turniergäste) **kein Sätze-Format** — durchgängig nur Legs, aber mit
mehr Legs für die wichtigen letzten Spiele:

- Gruppenphase + Halbfinale: Best-of-3-Legs (`legsToWin:2`) — bereits
  heutiger Standard-Modus der App, unverändert.
- Finale + Spiel um Platz 3: Best-of-5-Legs (`legsToWin:3`) — mehr
  Drama fürs Wichtige, ohne neues Konzept einzuführen.

## Context

8 Teams, echtes bevorstehendes Turnier. `dart-turnier.jsx` unterstützt
bisher nur Single Elimination (7 Spiele + optional Platz-3-Spiel).
Neu festgelegt fürs reale Turnier:

- 2 Gruppen à 4 Teams (Rundenspiele), danach KO-Playoff.
- Top 2 je Gruppe → Halbfinale, gekreuzt gepaart, dann Finale (Platz
  1/2) und Spiel um Platz 3 (Verlierer-Halbfinale) — **16 Spiele
  insgesamt** (12 Gruppenspiele + 4 KO).
- Team→Gruppe-Zuordnung wird ausgelost (Zufall, wie beim bestehenden
  K.o.-Draw).
- Spielreihenfolge in der Gruppenphase wechselt zwischen den Gruppen
  ab: 1. Spiel Gruppe 1, 2. Spiel Gruppe 2, 3. Spiel Gruppe 1, usw.
  (nicht erst alle 6 Spiele von Gruppe 1, dann Gruppe 2).
- Wer welchen Spieler pro Leg einsetzt (Team hat 2 Spieler) wird
  **nicht** softwareseitig abgebildet — das regelt der Spielleiter
  von Hand.

## Verhältnis zu `feature/gruppenphase` (16.08.)

Es existiert bereits eine Spec/Plan auf Branch `feature/gruppenphase`
für eine Gruppenphase, dort aber explizit als *zusätzlicher,
zweiter Format-Pfad* über `tournament.js`/`round-robin.js`/
`single-elim.js` (Teilnehmer-ID-Modell) konzipiert, mit der Prämisse
"das reale Turnier bleibt K.-o.-only". Diese Prämisse ist durch die
aktuelle Turnierplanung überholt — das reale Turnier braucht jetzt
Gruppen. Statt den alten, größeren Umbau zu reaktivieren: **eigenständige,
kleinere Lösung für das reale Turnier**, alter Branch/Plan bleibt
unangetastet für eine mögliche spätere, größere Iteration.

## Zeitfaktor (dokumentiert, keine offene Entscheidung)

16 Spiele total. Gruppenphase + Halbfinale mit Best-of-3-Legs
(Ø ~2,4 Legs/Spiel) × 14 Spiele ≈ 34 Legs, Finale + Platz 3 mit
Best-of-5-Legs (Ø ~3,7 Legs/Spiel) × 2 ≈ 7 Legs. Zusammen ≈ 41 Legs
am Abend, ohne neues Sätze-Konzept — deutlich weniger und einfacher
zu erklären als die ursprünglich angedachte Sätze-Variante (≈50+ Legs,
verschachtelte Struktur).

## Scope

- 2 Gruppen à 4 Teams, Einfachrunde (6 Spiele/Gruppe).
- Top 2 je Gruppe → KO-Bracket (4 Teams): Halbfinale gekreuzt
  (Gruppe-1-Erster vs. Gruppe-2-Zweiter, Gruppe-2-Erster vs.
  Gruppe-1-Zweiter), Finale, Spiel um Platz 3 (Verlierer-Halbfinale)
  — nutzt die bereits vorhandene `thirdPlace`-Logik in `buildBracket`
  unverändert.
- Gruppenspiele + Halbfinale: `legsToWin:2` (bestehender Default).
- Finale + Spiel um Platz 3: `legsToWin:3` — neue, zur letzten Runde
  gehörende Config-Variante, analog zum bestehenden `finalDoubleOut`-
  Muster (das schon heute nur die letzte Runde anders behandelt).
- Gruppenspiel-Reihenfolge alterniert zwischen den beiden Gruppen.
- Keine Spieler-pro-Leg-Zuordnung in der Software.

**Out of scope:** mehr/andere Gruppengrößen, Swiss, Double-Elim,
Sätze-Format (verworfen), konfigurierbares Format (fix für dieses
Turnier), alles, was schon in der `feature/gruppenphase`-Spec als
"später" markiert ist.

## Architektur

Kein Umbau auf `tournament.js`. Neue, eigenständige, reine Funktionen
in `dart-turnier.jsx`, im Stil von `buildBracket`, gleiche
Match-Objektform (`{id,t1,t2,winner,game,...}` — Team-Index-Modell),
damit `ScoringView`/`MatchCard`/`TvMatchCard` unverändert weiterlaufen:

- `buildGroups(teams)` — 8 Team-Indizes (nach bestehendem `shuffle()`
  bereits gemischt) → 2 Gruppen à 4, Round-Robin-Spielplan pro Gruppe
  (Standard-Spielplan für 4 Teilnehmer, 3 Runden × 2 Spiele = 6 Spiele/
  Gruppe). Matches entstehen über das **bestehende, unveränderte**
  `newMatch(id,t1,t2,...,legsToWin=2)`. Die 12 Matches werden
  anschließend Gruppe-für-Gruppe im Wechsel einsortiert
  (`G1[0],G2[0],G1[1],G2[1],…,G1[5],G2[5]`), das steuert die
  Anzeige-/Spielreihenfolge in der UI.
- `buildBracket` bekommt einen neuen, optionalen Config-Wert
  `finalLegsToWin` (Default = `legsToWin`, hier `3`): nur die letzte
  Runde (Finale) und das Platz-3-Spiel nutzen ihn beim `newMatch(...)`-
  Aufruf, alle anderen Runden (hier: die Halbfinals) bleiben bei
  `legsToWin`. Gleiches Muster wie das bestehende `finalDoubleOut`,
  das ebenfalls nur `r===numRounds-1` anders behandelt.
- **Kein Sätze-Format, keine Engine-Config-Änderung nötig** —
  `setsToWin`/`legsPerSet` kommen in diesem Feature nicht vor.
- `groupStandings(group)` — Tabelle: Siege, Tiebreak-Reihenfolge
  Legdifferenz → direkter Vergleich (Head-to-Head aus dem bereits
  gespielten Gruppenspiel der beiden Teams). Bleibt auch danach noch
  ein Gleichstand (z.B. 3er-Zirkel gleicher Bilanz), zeigt die UI die
  Teams als punktgleich an — Auflösung dann manuell durch den
  Spielleiter (Los), kein weiterer Software-Tiebreak nötig für diesen
  seltenen Fall.
- Übergang zur KO-Phase: sobald alle 12 Gruppenspiele `winner!==null`,
  Top 2 je Gruppe ermitteln, Team-Indizes in Reihenfolge
  `[G1-1,G2-2,G2-1,G1-2]` an bestehendes `buildBracket(teams, {...,
  thirdPlace:true, finalLegsToWin:3})` übergeben — KO-Teil sonst 1:1
  bestehender Code.
- Neuer `phase`-Wert (State-Machine der Komponente) zwischen Setup und
  KO: `"groups"` — Gruppentabellen + Gruppenspiele, mit Button
  "Weiter zur KO-Phase" (aktiv erst wenn alle Gruppenspiele fertig).

## UI-Änderungen

- Setup: kein neuer Modus-Schalter nötig (Gruppenphase ist jetzt der
  einzige Weg für 8 Teams bei diesem Turnier) — aber `teamSize` bleibt
  variabel für andere Nutzungen der App; Gruppenphase nur aktiv wenn
  `teamSize === 8` (sonst bisheriges reines K.o. wie gehabt).
- Neue `GroupOverview`-Komponente: 2 Tabellen (Platz, Team, S-N, Legdiff),
  analog zur bestehenden `StatsView`-Kartenoptik, plus die alternierende
  Spielliste (Gruppe 1/Gruppe 2 im Wechsel) darunter.
- `ScoringView`: keine Änderung nötig — läuft weiterhin im reinen
  Leg-Anzeige-Modus wie heute, auch im Finale (nur `legsToWin` ist
  dort höher, keine neue Anzeige-Ebene).
- TV-Ansicht: Gruppentabellen während Phase 1, automatischer Wechsel zur
  bestehenden Bracket-TV-Optik sobald KO-Phase läuft.

## Persistenz

Neues Feld im gespeicherten State (z.B. `groupPhase: {groups, matches}`)
neben dem bestehenden `bracket`-Feld — kein Schema-Bruch für
Alt-Speicherstände (reines K.o. bei anderer `teamSize` bleibt exakt wie
bisher).

## Testing

Neue reine Funktionen (`buildGroups`, `groupStandings`) bekommen einen
kleinen Test im projekteigenen Custom-Runner-Stil (`assert`/`eq`, siehe
`tests/*.test.js`) — kein neues Framework. UI-seitig manueller Durchlauf
(Setup → 8 Teams → Gruppenphase komplett durchspielen → KO-Übergang →
Finale mit Best-of-5) vor Merge, kein Playwright-Aufbau nötig für
diesen kleineren Scope.

## Out of scope

Alles aus der `feature/gruppenphase`-Spec, was dort schon als "später"
markiert ist (Swiss, Double-Elim, Multi-Board, Spieler-DB, Cross-Device-
Sync), das verworfene Sätze-Format, sowie ein konfigurierbarer
Format-Umschalter — dieses Design ist fix auf "8 Teams, 2 Gruppen,
gestaffeltes Legs-Format" zugeschnitten.
