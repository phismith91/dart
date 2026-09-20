# Post-Turnier-Fixes — Design

## Context

Erstes reales Turnier lief 2026-09-19. Sechs Rückmeldungen danach, alle
root-caused durch Code-Lesen (nicht geraten):

1. Checkout-Vorschläge in Gruppenphase/Halbfinale (Single Out) sichtbar
   schwächer als im Finale (Double Out).
2. Wunsch nach 301-Option zusätzlich zu 501.
3. Darts-Tab-Eingabe "kann verbessert werden" → konkretisiert: Feld-
   Reihenfolge soll durchgehend 20→1 lesbar sein.
4. Klick auf die Team-Karte im Scoring-Screen während eines Spiels führt
   dazu, dass eingegebene Punkte am falschen Team landen bzw. nicht dort
   ankommen, wo erwartet.
5. Mehrere "Undo"-Buttons ohne erkennbaren Unterschied beim Hovern.
6. Crash ("Cannot read properties of null") + nötiger Hard-Refresh, wenn
   man in der Gruppenphase nach einem beendeten Match auf "Zurück" klickt.

Betroffene Dateien: `dart-turnier.jsx`, `groups.js`, `src/checkouts.js`,
`tests/engine.test.js`.

**Branch:** `feature/post-turnier-fixes`, von `master` (dort sind beide
vorherigen Feature-Branches bereits gemergt).

## Root Causes (verifiziert im Code)

**#6 Crash:** `back()` (`dart-turnier.jsx:1013`) ruft hart
`setPhase("bracket")`. Ohne KO-Phase ist `bracket===null`; der Render
fällt danach ungeschützt in den Bracket-Zweig (`getChampion(bracket)`
mit `bracket=null`) → Crash.

**#4 Team-Karte:** Die Team-Karten in `ScoringView` (`dart-turnier.jsx`,
`sides.map(...onClick={()=>setAp(p)}...)`) ändern nur den lokalen
`ap`-State (steuert, welche Seite als "aktiv" markiert/für Rest-Anzeige
und Grid-Disabling herangezogen wird). Die tatsächliche Buchung
(`addScore`/`addDarts` → `throwTotal`/`throwDarts`) verwendet immer
`match.game.currentPlayer` aus der Engine, unabhängig von `ap`. Klickt
man während einer laufenden Aufnahme die andere Karte an, zeigt die UI
den falschen Rest/Checkout für die Eingabe, während die Buchung weiter
beim echten Spieler am Zug landet — Ergebnis: Punkte scheinen "beim
falschen Team" oder "gar nicht" anzukommen. Beide Karten zeigen bereits
gleichzeitig Name/Rest/Checkout/Verlauf für beide Teams an — der Klick
bringt keinen Zusatznutzen, der nicht schon sichtbar wäre.

**#5 Undo-Buttons:** Drei verschiedene Controls, alle nur mit
`aria-label` (kein sichtbarer Hover-Tooltip, da kein `title`-Attribut):
Header `↩` (`undoThrow`, letzte *gebuchte* Aufnahme zurück), Header
`↩L` (`undoLeg`, letztes *abgeschlossenes Leg* zurück), Darts-Tab `↩`
(entfernt den zuletzt *lokal gequeuten, noch nicht gebuchten* Dart).

**#1 Checkout Single Out:** `getCheckout()` in `src/checkouts.js`
liefert im `'single'`-Modus nur dann einen konkreten Pfad, wenn der Rest
in einem Dart geht (`SINGLE_DART_VALUES.has(remaining)`, ≤60). Für 2-
oder 3-Dart-Reste kommt nur der Platzhalter `"setup + finish"`, den
`checkoutSuggestion()` in `dart-turnier.jsx` aktiv ausblendet (`co.path
!== "setup + finish"`). Double Out (`DO_TABLE`) hat dagegen 170
konkrete Einträge. Fix: echte Pfadsuche für Single Out.

**#2 301-Option:** Die Engine unterstützt beliebigen `startScore`
(`src/types.js` `defaultConfig`), aber `groups.js:13` hat `501` fest in
`newMatch()` einprogrammiert, und das Setup-UI hat keinen Umschalter.

**#3 Feld-Reihenfolge:** `renderDarts()` in `dart-turnier.jsx` teilt die
Felder in zwei disjunkte Blöcke (`highFields=[20..11]`,
`lowFields=[10..1]`), nebeneinander als zwei Spalten. Pro Zeile stehen
dadurch nicht benachbarte Zahlen nebeneinander (Zeile 1: 20 & 10, Zeile
2: 19 & 9, ...). User will echte absteigende Nachbarn pro Zeile (20&19,
18&17, ..., 2&1).

## Scope

### A) Mechanische UI-Fixes (dart-turnier.jsx, ein Task)

**A1 — Crash-Fix:** `back` bestimmt Zielphase anhand vorhandener Daten
statt hart "bracket":

```js
const back=()=>{setActiveMatchId(null);setPhase(bracket?"bracket":"groups");};
```

**A2 — Team-Karte kein Eingabe-Ziel mehr:** Klick-Handler von den
Team-Karten entfernen (werden reine Anzeige-`div`s statt `button`), da
`ap` bereits nach jedem Wurf/Undo/Leg-Start automatisch mit
`match.game.currentPlayer` synchron gehalten wird (bestehender Code in
`applyThrowResult`, `undoThrow`, `undoLeg`, `selectStarter`) und beide
Karten schon parallel alle Infos anzeigen. `aria-pressed` entfällt
(kein interaktives Element mehr), `aria-label` bleibt als Beschreibung.

**A3 — Undo-Buttons sichtbar beschriften:** Header-Buttons bekommen
sichtbaren Text statt reinem Icon, plus `title` für alle drei Controls:

- Header `↩` → Text `"Wurf ↩"`, `title="Letzte Aufnahme zurücknehmen"`
- Header `↩L` → Text `"Leg ↩"`, `title="Letztes Leg zurücknehmen"`
- Darts-Tab `↩` (Zeile mit `aria-label="Letzten Dart entfernen"`) →
  Text `"Dart ↩"`, `title="Zuletzt eingegebenen Dart entfernen"`

**A4 — Feld-Reihenfolge Darts-Tab:** `renderHalf`/Spalten-Split durch
zeilenweise absteigende Paare ersetzen: Zeile `i` (0-9) zeigt Feld
`20-2i` und `19-2i` nebeneinander, macht die Lese-Reihenfolge
durchgehend 20→1.

### B) Checkout Single Out (src/checkouts.js + dart-turnier.jsx)

Echte Pfadsuche über die vorhandene `SINGLE_DART_VALUES`-Menge
(reines Set aller 1-Dart-Werte 1–60 plus 25/50), greedy von oben:

```js
const SORTED_DART_VALUES = [...SINGLE_DART_VALUES].filter(v => v > 0).sort((a, b) => b - a);

function singleOutPath(remaining, dartsLeft) {
  if (dartsLeft <= 0) return null;
  if (SINGLE_DART_VALUES.has(remaining)) return [remaining];
  if (dartsLeft === 1) return null;
  for (const v of SORTED_DART_VALUES) {
    if (v >= remaining) continue;
    const rest = singleOutPath(remaining - v, dartsLeft - 1);
    if (rest) return [v, ...rest];
  }
  return null;
}
```

`getCheckout()`'s `'single'`-Zweig nutzt das statt der alten
1-Dart-only-Logik plus Platzhalter:

```js
if (mode === 'single') {
  const path = singleOutPath(remaining, Math.min(dartsLeft, 3));
  if (!path) return null;
  const labels = path.map(v => { const d = singleDartFor(v); return dartLabel(d.field, d.multiplier); });
  return { path: labels.join(' '), darts: path.length };
}
```

`dart-turnier.jsx`'s `checkoutSuggestion()` verliert den jetzt toten
Placeholder-Filter:

```js
function checkoutSuggestion(rem,isDoubleOut){
  const co=engineGetCheckout(rem,isDoubleOut?"double":"single");
  return co?co.path:null;
}
```

Echte Bogey-Zahlen (z.B. 178) liefern weiterhin `null`, da die
Pfadsuche für sie erschöpfend fehlschlägt — kein Sonderfall nötig.

### C) 301-Option (groups.js + dart-turnier.jsx)

- `newMatch(id,t1,t2,roundIdx,isThirdPlace=false,isDoubleOut=false,legsToWin=2,startScore=501)`
  — neuer letzter Parameter, in `createGame({startScore,...})` verwendet.
- `buildGroups(teams,startScore=501)` reicht `startScore` an alle
  `newMatch(...)`-Aufrufe in `buildGroupMatches` durch.
- `buildBracket()` (`dart-turnier.jsx`) reicht `config.startScore` als
  achtes Argument an beide `newMatch(...)`-Aufrufe (Hauptrunden +
  Platz-3) durch.
- `startTournament()`: `buildGroups(names)` → `buildGroups(names,config.startScore)`.
- Setup-Config-State (`useState({...})`) bekommt `startScore:501` als
  Default.
- Setup-UI: neuer Zwei-Wege-Umschalter neben den bestehenden
  Checkboxen (Double Out / Platz 3), zwei Pill-Buttons "301"/"501",
  aktiver Wert grün hervorgehoben, Klick setzt `config.startScore`.
- Alle hartkodierten `"501"`-Textstellen (Setup-Vorschau, RulesModal,
  Bracket-Rundenköpfe — siehe Root-Cause-Liste, 7 Stellen) durch
  `config.startScore` bzw. `bracket.config.startScore` ersetzen.

## Out of scope

- Änderungen an Sets-Logik, Turnierformat selbst (bereits final).
- Perfekte/kanonische Checkout-Pfade (z.B. bevorzugte Finish-Reihenfolge
  wie bei PDC-Charts) — jede korrekte 1-3-Dart-Kombination reicht.
- Persistente Migration alter gespeicherter Turniere ohne `startScore`
  — `defaultConfig()`/`newMatch()`-Defaults (501) greifen automatisch,
  kein Schema-Bump nötig.

## Testing

`npm test` (neue Regressionstests für `singleOutPath`/`getCheckout`
Single-Out in `tests/engine.test.js`) + `npx esbuild --bundle
--loader:.jsx=jsx` (Syntax-Check) + manueller Klicktest durch den User
auf dem Dev-Server (kein Playwright-Aufbau, wie in den vorherigen Specs
begründet).
