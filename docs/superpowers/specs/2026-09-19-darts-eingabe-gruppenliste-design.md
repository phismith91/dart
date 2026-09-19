# Darts-Eingabe-Redesign + Gruppenliste-Klarheit — Design

## Context

Feedback aus echtem Klicktest auf dem Dev-Server (2026-09-19), vier Punkte:

1. Bull (25) und Bullseye (50) sollen unabhängig vom aktuell gewählten
   Single/Double/Triple-Modus immer beide sichtbar/wählbar sein.
2. Das Umschalten zwischen Single/Double/Triple vor jedem Feld-Tap
   kostet 2 Taps pro Wurf — nervt.
3. Wunsch nach manueller Text-Eingabe ("S2"/"D2"/"T2") als Alternative.
4. Die Gruppenphase-Spielliste (`GroupOverview`, wer-gegen-wen) ist
   unübersichtlich, weil beide Gruppen in einem gemischten Grid liegen.

Betroffene Datei: `dart-turnier.jsx`, Funktionen `ScoringView`
(genauer: der `renderDarts()`-Closure innerhalb davon) und
`GroupOverview`.

**Branch:** `feature/darts-eingabe-ux`, abgezweigt von
`feature/gruppenphase-saetze-turnier` (nicht `master`) — `GroupOverview`
existiert nur dort, noch nicht gemergt.

## Entscheidung (nach Rückfrage, User-Auswahl)

- Darts-Tab bekommt ein 3-Spalten-Grid (S/D/T-Werte pro Feld immer alle
  sichtbar) statt Umschalter+einspaltigem Grid. Löst Punkt 1 (Bull-Zeile
  zeigt beide Werte permanent) und Punkt 2 (1 Tap statt 2) in einem Zug.
- Zusätzlich eine manuelle Text-Eingabe ("S2"/"D2"/"T2"/"0") — User
  wollte sie trotz des schnelleren Grids explizit noch dazu.
- `GroupOverview`s Matchliste wird in 2 getrennte Spalten (Gruppe 1 /
  Gruppe 2) aufgeteilt statt einem gemischten `order`-basierten Grid —
  User bestätigt: die Vermischung beider Gruppen ist der Kernpunkt,
  keine zusätzliche Runden-Struktur gefordert.
- Klickbare SVG-Dartscheibe (ursprünglich Punkt 3 im ersten Feedback)
  ist **explizit nicht Teil dieser Spec** — User will sie zuletzt,
  separat, mit eigenem Brainstorming/Mockup.

## Scope

### 1. Darts-Tab: 3-Spalten-Grid

- `mm`-State (`useState("S")`, aktuell der S/D/T-Umschalter) entfällt.
- `addDart(field)` wird zu `addDart(field, multiplier)` — Multiplikator
  kommt jetzt immer explizit vom Aufrufer, nicht mehr aus `mm`.
- Neues Layout in `renderDarts()`: Kopfzeile mit Spaltenlabels
  S/D/T, darunter eine Zeile pro Feld 1-20 mit 3 Buttons (Wert +
  Kurzlabel, z.B. "20"/"40"/"60" für Feld 20), danach eine Bull-Zeile
  (S=25, D=50, T-Spalte leer/deaktiviert — es gibt kein Triple-Bull),
  danach ein separater Miss-Button (0, kein Multiplikator-Unterschied).
- Bestehende Elemente bleiben unverändert: die "Darts bisher"-Anzeige
  oben (3 Slots + Summe), der S/D/T-Farbcode (`mc`/`ml`), der
  Undo-letzter-Dart-Button, der "Darts eintragen"-Submit-Button.
- Farbcodierung pro Spalte übernimmt die bestehenden `mc`-Farben
  (`S:textMid, D:green, T:colRed`) als Spalten-Akzent statt als
  Umschalter-Zustand.

### 2. Manuelle Text-Eingabe

- Neues `<input type="text">` + Button, direkt unter dem Grid, im
  selben `renderDarts()`-Block.
- Grammatik: `^(0)$` (Miss) oder `^[SDT](\d{1,2}|25)$` (case-insensitive,
  wird beim Parsen uppercased). `T25` wird explizit abgelehnt (kein
  Triple-Bull) — Validierung nutzt dieselbe `isValidDart(field,multi)`
  aus `src/types.js`, die das bereits abdeckt (kein Sonderfall-Code
  nötig).
- Bei ungültiger Eingabe: Input bekommt kurz einen roten Rahmen
  (State-Flag, per `setTimeout` nach ~600ms zurückgesetzt, gleiches
  Muster wie das bestehende `bustMsg`-Timeout), kein Submit, kein neuer
  Toast-Mechanismus.
- Bei gültiger Eingabe: ruft `addDart(field, multiplier)` auf (dieselbe
  Funktion wie die Grid-Buttons), Input wird geleert. Landet in
  derselben `darts[]`-Warteschlange — Undo/Submit-Verhalten identisch
  zu Grid-Eingaben, kein Sonderfall in `addDarts`/`applyThrowResult`
  nötig.

### 3. GroupOverview: 2 getrennte Spalten

- Der aktuelle `groupPhase.order.map(...)`-Grid (12 Karten gemischt)
  wird ersetzt durch 2 Blöcke: "Gruppe 1" (rendert `groupPhase.group1`,
  6 Karten) und "Gruppe 2" (rendert `groupPhase.group2`, 6 Karten),
  nebeneinander auf Desktop, untereinander gestapelt auf Mobile
  (gleiches Breakpoint-Verhalten wie die bereits existierenden
  Standings-Karten direkt darüber, die schon `flexWrap:"wrap"`
  benutzen).
- `MatchCard` selbst bleibt unverändert (gleiche Komponente, nur andere
  Datenquelle/Gruppierung beim Aufruf).
- Die tatsächliche Spielreihenfolge am Abend (G1/G2 alternierend, aus
  `buildGroups`' `order`-Array) bleibt technisch unverändert — `order`
  wird weiterhin für nichts anderes gebraucht als bisher (aktuell nur
  für diese eine Render-Stelle genutzt; nach dieser Änderung wird
  `order` an dieser Stelle nicht mehr gerendert, bleibt aber im
  Datenmodell für spätere Zwecke, z.B. TV-Ansicht, die weiterhin
  `groupPhase.order` nutzt — **`TvGroupOverview` wird von dieser Spec
  nicht angefasst**, behält ihr bestehendes gemischtes Layout, da dafür
  kein Feedback vorliegt).

## Out of scope

- Klickbare SVG-Dartscheibe (separates, späteres Brainstorming).
- `TvGroupOverview` (TV-Bildschirm-Variante) — kein Feedback dazu, bleibt
  wie sie ist.
- Rundenstruktur/Spieltag-Anzeige in `GroupOverview` — explizit nicht
  gefordert (User bestätigt: nur die Gruppen-Vermischung ist das
  Problem).
- Numpad-Tab, Favoriten-Tab, Zahl-Grid-Tab (0-60/61-120/121-180) —
  unverändert, betreffen Gesamtpunktzahl pro Aufnahme, nicht
  Einzeldart-Multiplikatoren.

## Testing

`dart-turnier.jsx` hat keinen Unit-Test-Harness (JSX, Prototyp, siehe
napkin/CLAUDE.md) — Verifikation wie bisher: `npm test` (Regressionen
in `src/`, unberührt) + `npx esbuild --bundle --loader:.jsx=jsx`
(Syntax-Check) + manueller Klicktest durch den User auf dem Dev-Server
(kein Playwright-Aufbau für diesen Scope, gleiche Begründung wie in der
Gruppenphase-Spec).
