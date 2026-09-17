# Gruppenphase + Sätze-Format fürs reale Turnier — Design

## Context

8 Teams, echtes bevorstehendes Turnier. `dart-turnier.jsx` unterstützt
bisher nur Single Elimination (7 Spiele + optional Platz-3-Spiel).
Neu festgelegt fürs reale Turnier:

- 2 Gruppen à 4 Teams (Rundenspiele), danach KO-Playoff.
- Match-Format: Best-of-3-Sätze (2 Gewinnsätze gewinnen das Match),
  ein Satz = Best-of-3-Legs.
- Wer welchen Spieler pro Satz einsetzt (Team hat 2 Spieler, freie
  Zuordnung, Wiederholung nur im 3. Satz erlaubt) wird **nicht**
  softwareseitig abgebildet — das regelt der Spielleiter von Hand.

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

16 Spiele total (12 Gruppenspiele + 4 KO), Sätze-Format ≈ 4–9 Legs/Match
(Ø ~5–6) statt bisheriger flacher Best-of-3-Legs (Ø ~2,4) — spürbar
längerer Abend als reines K.o. (8 Spiele, Ø ~2,4 Legs). Bewusst in Kauf
genommen (reines K.o. wäre "doof" — Teams sollen mehrere Spiele haben).

## Scope

- 2 Gruppen à 4 Teams, Einfachrunde (6 Spiele/Gruppe).
- Top 2 je Gruppe → KO-Bracket (4 Teams): Halbfinale gekreuzt
  (Gruppe-A-1. vs. Gruppe-B-2., Gruppe-B-1. vs. Gruppe-A-2.), Finale,
  Spiel um Platz 3 (Verlierer-Halbfinale) — nutzt die bereits
  vorhandene `thirdPlace`-Logik in `buildBracket` unverändert.
- Match-Format einheitlich für Gruppen- und KO-Phase: `setsToWin: 2`,
  `legsPerSet: 2` (Engine-Semantik: `legsPerSet` = Legs, die zum
  Satzgewinn nötig sind → 2 = Best-of-3-Legs).
- Keine Spieler-pro-Satz-Zuordnung in der Software.

**Out of scope:** mehr/andere Gruppengrößen, Swiss, Double-Elim,
konfigurierbares Sätze-Format (fix für dieses Turnier), alles, was
schon in der `feature/gruppenphase`-Spec als "später" markiert ist.

## Architektur

Kein Umbau auf `tournament.js`. Neue, eigenständige, reine Funktionen
in `dart-turnier.jsx`, im Stil von `buildBracket`, gleiche
Match-Objektform (`{id,t1,t2,winner,game,...}` — Team-Index-Modell),
damit `ScoringView`/`MatchCard`/`TvMatchCard` unverändert weiterlaufen:

- `buildGroups(teams)` — 8 Team-Indizes (nach bestehendem `shuffle()`
  bereits gemischt) → 2 Gruppen à 4, Round-Robin-Spielplan pro Gruppe
  (Standard-Spielplan für 4 Teilnehmer, 3 Runden × 2 Spiele), Matches
  im bestehenden Match-Shape, `createGame({startScore:501,
  checkoutMode:"single", setsToWin:2, legsPerSet:2, dartsPerTurn:3})`.
- `groupStandings(group)` — Tabelle: Siege, Tiebreak-Reihenfolge
  Satzdifferenz → Legdifferenz → direkter Vergleich (Head-to-Head aus
  dem bereits gespielten Gruppenspiel der beiden Teams). Bleibt auch
  danach noch ein Gleichstand (z.B. 3er-Zirkel gleicher Bilanz), zeigt
  die UI die Teams als punktgleich an — Auflösung dann manuell durch
  den Spielleiter (Los), kein weiterer Software-Tiebreak nötig für
  diesen seltenen Fall.
- Übergang zur KO-Phase: sobald alle 12 Gruppenspiele `winner!==null`,
  Top 2 je Gruppe ermitteln, Team-Indizes in Reihenfolge
  `[A1,B2,B1,A2]` an bestehendes `buildBracket(teams, {...,
  thirdPlace:true})` übergeben — KO-Teil 1:1 bestehender Code.
- Neuer `phase`-Wert (State-Machine der Komponente) zwischen Setup und
  KO: `"groups"` — Gruppentabellen + Gruppenspiele, mit Button
  "Weiter zur KO-Phase" (aktiv erst wenn alle Gruppenspiele fertig).

## UI-Änderungen

- Setup: kein neuer Modus-Schalter nötig (Gruppenphase ist jetzt der
  einzige Weg für 8 Teams bei diesem Turnier) — aber `teamSize` bleibt
  variabel für andere Nutzungen der App; Gruppenphase nur aktiv wenn
  `teamSize === 8` (sonst bisheriges reines K.o. wie gehabt).
- Neue `GroupOverview`-Komponente: 2 Tabellen (Platz, Team, S-N, Satzdiff,
  Legdiff), analog zur bestehenden `StatsView`-Kartenoptik.
- `ScoringView`: zusätzliche Satzanzeige (aktueller Satzstand X:Y) über
  der bestehenden Leg-Anzeige — Daten kommen aus `state.sets`, das die
  Engine bei gesetztem `setsToWin` bereits liefert.
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
Finale) vor Merge, kein Playwright-Aufbau nötig für diesen kleineren Scope.

## Out of scope

Alles aus der `feature/gruppenphase`-Spec, was dort schon als "später"
markiert ist (Swiss, Double-Elim, Multi-Board, Spieler-DB, Cross-Device-
Sync) sowie ein konfigurierbarer Format-Umschalter — dieses Design ist
fix auf "8 Teams, 2 Gruppen, Sätze-Format" zugeschnitten.
