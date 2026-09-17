# Gruppenphase + gestaffeltes Legs-Format Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `dart-turnier.jsx` bekommt einen zweiten Ablauf für genau 8 Teams: 2 Gruppen à 4 (Einfachrunde, Best-of-3-Legs) → Top 2 je Gruppe gekreuzt ins bestehende K.o.-Bracket (Halbfinale Best-of-3, Finale + Platz 3 Best-of-5). Der bisherige reine K.o.-Modus (andere Teamzahlen) bleibt unverändert.

**Architektur:** Neue reine Engine-Funktionen (`buildGroups`, `groupStandings`, `newMatch`) leben in einer neuen Datei `groups.js` (kein JSX, dadurch mit `node` testbar — `dart-turnier.jsx` selbst kann wegen JSX-Syntax nicht direkt von einem Node-Testskript importiert werden). `dart-turnier.jsx` importiert daraus und bekommt einen neuen `phase==="groups"`-Zustand plus eine `GroupOverview`-Komponente; das bestehende Bracket (`buildBracket`/`MatchCard`/`ScoringView`/`TvOverview`) bleibt strukturell unverändert und wird nur um einen optionalen `finalLegsToWin`-Konfigwert erweitert (analog zum bestehenden `finalDoubleOut`-Muster).

**Tech Stack:** React 18 (dart-turnier.jsx, Single-File-Prototyp, kein Build-Schritt außer `_preview/` Vite-Dev-Server), `src/engine.js` (Scoring-Engine, unverändert), Node-eigener Test-Runner (`assert`/`eq`, kein Framework) für `groups.js`. Referenz-Spec: `docs/superpowers/specs/2026-09-17-gruppenphase-saetze-design.md`.

---

## Vorab: Dev-Server für manuelle Verifikation

Alle Tasks mit UI-Änderungen werden manuell im Browser geprüft (kein Playwright-Aufbau für diesen Scope, siehe Spec). Dev-Server starten und offen lassen:

```bash
cd /home/philipp/projects/dart/_preview && npm install && npm run dev
```

Browser-URL wird von Vite ausgegeben (i.d.R. `http://localhost:5173`).

---

### Task 1: `groups.js` — Gruppenphase-Engine (reine Funktionen, testbar)

**Files:**
- Create: `/home/philipp/projects/dart/groups.js`
- Create: `/home/philipp/projects/dart/tests/groups.test.js`
- Modify: `/home/philipp/projects/dart/package.json` (Test-Skripte)
- Modify: `/home/philipp/projects/dart/dart-turnier.jsx:1-68` (Import statt lokaler `newMatch`-Definition)

- [ ] **Step 1: `groups.js` schreiben**

`newMatch` wird 1:1 aus `dart-turnier.jsx` (aktuell Zeile 65-68) hierher verschoben — unverändert, nur der Ort ändert sich, damit die Funktion (und alles, was sie nutzt) von einem reinen Node-Skript importierbar ist. `dart-turnier.jsx` enthält JSX-Syntax und kann deshalb nicht direkt von `node` geparst werden.

```js
// ═══════════════════════════════════════════
// Gruppenphase-Engine — reine Funktionen, kein React, kein JSX.
// Bewusst getrennt von src/formats/round-robin.js: dort läuft ein
// Teilnehmer-ID-Modell (für den separaten feature/gruppenphase-Branch),
// hier das Team-Index-Modell, das dart-turnier.jsx (buildBracket,
// MatchCard, ScoringView) schon überall verwendet — siehe
// docs/superpowers/specs/2026-09-17-gruppenphase-saetze-design.md
// ═══════════════════════════════════════════
import { createGame } from "./src/engine.js";

export function newMatch(id,t1,t2,roundIdx,isThirdPlace=false,isDoubleOut=false,legsToWin=2){
  return{id,t1,t2,roundIdx,isThirdPlace,winner:null,started:false,
    game:createGame({startScore:501,checkoutMode:isDoubleOut?"double":"single",legsToWin,dartsPerTurn:3})};
}

// Round-Robin-Spielplan für 4 Teilnehmer (Circle-Method): 3 Runden × 2 Spiele,
// jeder gegen jeden einmal. idx = die 4 Team-Indizes dieser Gruppe, in beliebiger
// Reihenfolge — nur für genau 4 Teilnehmer, absichtlich nicht generalisiert
// (dieses Turnier hat immer 2 Gruppen à 4, siehe Spec "Out of scope").
function roundRobinPairs4(idx){
  return [
    [[idx[0],idx[3]],[idx[1],idx[2]]],
    [[idx[0],idx[2]],[idx[3],idx[1]]],
    [[idx[0],idx[1]],[idx[2],idx[3]]],
  ];
}

/**
 * 8 Team-Indizes → 2 Gruppen à 4 (Team-Indizes 0-3 / 4-7), je 6 Spiele
 * (Einfachrunde, Best-of-3-Legs). Spielreihenfolge alterniert zwischen den
 * Gruppen (G1,G2,G1,G2,...) — das steuert später die Anzeige-/Spielreihenfolge.
 * @param {string[]} teams - 8 Team-Namen, Reihenfolge bestimmt die Gruppen-
 *   zugehörigkeit (0-3 = Gruppe 1, 4-7 = Gruppe 2) — Auslosung passiert vorher
 *   über das bestehende shuffle() in dart-turnier.jsx.
 */
export function buildGroups(teams){
  if(teams.length!==8)return{error:"NEED_EIGHT_TEAMS"};
  const buildGroupMatches=(groupTeams,groupIdx)=>{
    const rounds=roundRobinPairs4(groupTeams);
    const matches=[];
    rounds.forEach((pairs,r)=>pairs.forEach(([t1,t2],m)=>{
      matches.push(newMatch(`g${groupIdx}r${r}m${m}`,t1,t2,r));
    }));
    return matches;
  };
  const group1=buildGroupMatches([0,1,2,3],1);
  const group2=buildGroupMatches([4,5,6,7],2);
  const order=[];
  for(let i=0;i<6;i++){order.push(group1[i]);order.push(group2[i]);}
  return{teams:[...teams],group1,group2,order};
}

/**
 * Tabelle für eine Gruppe: sortiert nach Siegen, dann Legdifferenz, dann
 * direktem Vergleich. Bleibt danach noch ein Gleichstand (seltener 3er-Zirkel),
 * ist die Reihenfolge unter den betroffenen Teams beliebig — UI zeigt dann
 * identische Werte, Auflösung manuell durch den Spielleiter (siehe Spec).
 * @param {object[]} matches - Spiele dieser Gruppe (z.B. group.group1)
 * @param {number[]} teamIndices - die 4 Team-Indizes dieser Gruppe
 */
export function groupStandings(matches,teamIndices){
  const rows=teamIndices.map(i=>({team:i,played:0,won:0,legsFor:0,legsAgainst:0}));
  const byTeam=Object.fromEntries(rows.map(r=>[r.team,r]));
  for(const m of matches){
    if(m.winner===null)continue;
    const r1=byTeam[m.t1],r2=byTeam[m.t2];
    r1.played++;r2.played++;
    r1.legsFor+=m.game.legs[0];r1.legsAgainst+=m.game.legs[1];
    r2.legsFor+=m.game.legs[1];r2.legsAgainst+=m.game.legs[0];
    if(m.winner===m.t1)r1.won++;else r2.won++;
  }
  const headToHeadWinner=(a,b)=>{
    const m=matches.find(x=>(x.t1===a&&x.t2===b)||(x.t1===b&&x.t2===a));
    return m&&m.winner!==null?m.winner:null;
  };
  return rows
    .map(r=>({...r,legDiff:r.legsFor-r.legsAgainst}))
    .sort((a,b)=>{
      if(b.won!==a.won)return b.won-a.won;
      if(b.legDiff!==a.legDiff)return b.legDiff-a.legDiff;
      const h2h=headToHeadWinner(a.team,b.team);
      if(h2h===a.team)return -1;
      if(h2h===b.team)return 1;
      return 0;
    });
}
```

- [ ] **Step 2: Testdatei schreiben**

Testdaten sind von Hand durchgerechnet (siehe Kommentare) — keine Zufallswerte, damit die erwarteten Ergebnisse beim Ausführen exakt nachvollziehbar sind.

```js
// ═══════════════════════════════════════════
// Gruppenphase-Engine — Test Suite
// ═══════════════════════════════════════════
import { buildGroups, groupStandings } from '../groups.js';

let passed = 0, failed = 0;
const suite = (n) => console.log(`\n─── ${n} ───`);
const assert = (c, t) => { if (c) { passed++; } else { failed++; console.log(`  ❌ ${t}`); } };
const eq = (a, e, t) => { const A=JSON.stringify(a),E=JSON.stringify(e); if (A===E) { passed++; } else { failed++; console.log(`  ❌ ${t} — got: ${A}, want: ${E}`); } };

console.log('\n🎯 GROUPS ENGINE — TEST SUITE\n');

const teams = ['A','B','C','D','E','F','G','H'];

suite('buildGroups — Struktur');
const g = buildGroups(teams);
eq(g.group1.length, 6, 'Gruppe 1 hat 6 Spiele');
eq(g.group2.length, 6, 'Gruppe 2 hat 6 Spiele');
eq(g.order.length, 12, '12 Spiele insgesamt in der Reihenfolge');
assert(g.order[0].id.startsWith('g1'), 'erstes Spiel aus Gruppe 1');
assert(g.order[1].id.startsWith('g2'), 'zweites Spiel aus Gruppe 2');
assert(g.order[2].id.startsWith('g1'), 'drittes Spiel wieder aus Gruppe 1');
assert(g.order[3].id.startsWith('g2'), 'viertes Spiel wieder aus Gruppe 2');
const teamsInGroup1 = new Set(g.group1.flatMap(m => [m.t1, m.t2]));
eq([...teamsInGroup1].sort((a,b)=>a-b), [0,1,2,3], 'Gruppe 1 enthält Team-Indizes 0-3');
const teamsInGroup2 = new Set(g.group2.flatMap(m => [m.t1, m.t2]));
eq([...teamsInGroup2].sort((a,b)=>a-b), [4,5,6,7], 'Gruppe 2 enthält Team-Indizes 4-7');
for (const t of [0,1,2,3]) {
  const count = g.group1.filter(m => m.t1===t || m.t2===t).length;
  eq(count, 3, `Team ${t} spielt 3 Gruppenspiele (gegen jeden einmal)`);
}
eq(g.group1[0].game.scores, [501,501], 'jedes Spiel startet bei 501:501 (Engine-Default)');

suite('groupStandings — Tiebreak über Legdifferenz bei 3-Wege-Gleichstand');
// Handgerechnetes Szenario, Gruppe 1 (Teams 0,1,2,3), Spiele in Reihenfolge
// von roundRobinPairs4([0,1,2,3]): [0v3],[1v2],[0v2],[3v1],[0v1],[2v3]
const g1 = buildGroups(teams).group1;
const setResult = (m, winner, legs) => { m.winner = winner; m.game.legs = legs; };
setResult(g1[0], 0, [2,0]); // 0v3 → 0 gewinnt 2:0
setResult(g1[1], 1, [2,0]); // 1v2 → 1 gewinnt 2:0
setResult(g1[2], 2, [1,2]); // 0v2 → 2 gewinnt 2:1 (0 verliert knapp)
setResult(g1[3], 1, [0,2]); // 3v1 → 1 gewinnt 2:0
setResult(g1[4], 0, [2,1]); // 0v1 → 0 gewinnt 2:1
setResult(g1[5], 2, [2,0]); // 2v3 → 2 gewinnt 2:0
// Von Hand: Team0 2S/1N (legFor 5, legAgainst 3, diff +2)
//           Team1 2S/1N (legFor 5, legAgainst 2, diff +3)
//           Team2 2S/1N (legFor 4, legAgainst 3, diff +1)
//           Team3 0S/3N (legFor 0, legAgainst 6, diff -6)
// Alle drei bei 2 Siegen — Reihenfolge über Legdifferenz: 1 (+3) > 0 (+2) > 2 (+1) > 3
const table1 = groupStandings(g1, [0,1,2,3]);
eq(table1.map(r=>r.team), [1,0,2,3], 'Reihenfolge bei 3-Wege-Sieg-Gleichstand nach Legdifferenz');
eq(table1[0].won, 2, 'Tabellenführer hat 2 Siege');
eq(table1[0].legDiff, 3, 'Tabellenführer hat Legdifferenz +3');

suite('groupStandings — Tiebreak über direkten Vergleich');
// Gruppe 2 (Teams 4,5,6,7), Spiele: [4v7],[5v6],[4v6],[7v5],[4v5],[6v7]
const g2 = buildGroups(teams).group2;
setResult(g2[0], 7, [0,2]); // 4v7 → 7 gewinnt 2:0
setResult(g2[2], 6, [0,2]); // 4v6 → 6 gewinnt 2:0
setResult(g2[3], 7, [0,2]); // 7v5 → 7 gewinnt 2:0 (7 verliert dadurch NICHT — 7 ist t1 hier? nein t1=7,t2=5, gewinnt t1)
setResult(g2[5], 6, [2,0]); // 6v7 → 6 gewinnt 2:0
// Team6: Spiele g2[1](5v6, offen/unentschieden lassen wir aus),g2[2](Sieg 2:0),g2[5](Sieg 2:0)
//   → 2 Siege, legFor 4, legAgainst 0, diff +4 (played nur 2, g2[1] bleibt unentschieden/null)
// Team7: g2[0](Sieg 2:0), g2[3](Sieg 2:0) → 2 Siege, legFor 4, legAgainst 0, diff +4 — exakt gleich wie Team6
// g2[5] (6v7) ist der direkte Vergleich zwischen 6 und 7 → 6 hat gewonnen → 6 vor 7
const table2 = groupStandings(g2, [4,5,6,7]);
const idx6 = table2.findIndex(r=>r.team===6), idx7 = table2.findIndex(r=>r.team===7);
eq(table2[idx6].won, table2[idx7].won, 'Team 6 und Team 7 haben gleich viele Siege');
eq(table2[idx6].legDiff, table2[idx7].legDiff, 'Team 6 und Team 7 haben gleiche Legdifferenz');
assert(idx6 < idx7, 'bei Gleichstand entscheidet der direkte Vergleich (6 schlug 7) — 6 steht vor 7');

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 3: Test ausführen und verifizieren, dass er läuft (vor der `dart-turnier.jsx`-Anpassung testet er nur `groups.js`, ist also unabhängig)**

Run: `cd /home/philipp/projects/dart && node tests/groups.test.js`
Expected: `0 failed` am Ende, keine `❌`-Zeilen.

- [ ] **Step 4: `dart-turnier.jsx` auf den Import umstellen**

Entfernen (Zeile 65-68):

```js
function newMatch(id,t1,t2,roundIdx,isThirdPlace=false,isDoubleOut=false,legsToWin=2){
  return{id,t1,t2,roundIdx,isThirdPlace,winner:null,started:false,
    game:createGame({startScore:501,checkoutMode:isDoubleOut?"double":"single",legsToWin,dartsPerTurn:3})};
}
```

Import-Zeile 3 ergänzen (createGame wird jetzt nur noch indirekt über groups.js gebraucht, aber `createGame` selbst wird in dart-turnier.jsx nirgendwo sonst direkt aufgerufen — Import von `createGame` aus Zeile 3 entfernen, `newMatch`/`buildGroups`/`groupStandings` aus dem neuen Modul importieren):

```js
import { throwTotal, throwDarts, undoTurn, undoLeg as engineUndoLeg, setStarter, getStats } from "./src/engine.js";
import { getCheckout as engineGetCheckout } from "./src/checkouts.js";
import { IMPOSSIBLE_TOTALS, dartValue, dartLabel } from "./src/types.js";
import { newMatch, buildGroups, groupStandings } from "./groups.js";
```

- [ ] **Step 5: Manuell prüfen, dass sich nichts am bestehenden Verhalten geändert hat**

Im laufenden Dev-Server (siehe "Vorab"): Setup → Teamanzahl auf 4 stellen → 4 Teams benennen → "Turnier starten". Bracket muss wie vorher erscheinen (Halbfinale + Finale), ein Match öffnen und ein paar Würfe eintragen — Scoring muss unverändert funktionieren. Das bestätigt, dass die verschobene `newMatch`-Funktion identisch weiterarbeitet.

- [ ] **Step 6: package.json-Skripte ergänzen**

In `/home/philipp/projects/dart/package.json`, Zeile 22 (`"test": ...`) und danach Zeile 25 ergänzen:

```json
    "test": "node tests/engine.test.js && node tests/logger.test.js && node tests/tournament.test.js && node tests/groups.test.js",
    "test:engine": "node tests/engine.test.js",
    "test:logger": "node tests/logger.test.js",
    "test:tournament": "node tests/tournament.test.js",
    "test:groups": "node tests/groups.test.js"
```

- [ ] **Step 7: Commit**

```bash
cd /home/philipp/projects/dart
git add groups.js tests/groups.test.js package.json dart-turnier.jsx
git commit -m "$(cat <<'EOF'
Add groups.js: pure Gruppenphase-Engine (newMatch, buildGroups, groupStandings)

newMatch aus dart-turnier.jsx hierher verschoben, damit die Logik von
einem reinen Node-Testskript importierbar ist (dart-turnier.jsx enthält
JSX-Syntax, node kann es nicht direkt parsen). Kein Verhaltensunterschied
am bestehenden K.o.-Modus.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `finalLegsToWin` — gestaffeltes Format im bestehenden Bracket

**Files:**
- Modify: `/home/philipp/projects/dart/dart-turnier.jsx:82-118` (`buildBracket`)
- Modify: `/home/philipp/projects/dart/dart-turnier.jsx:590-618` (`RulesModal`)
- Modify: `/home/philipp/projects/dart/dart-turnier.jsx:915-934` (Bracket-Header Bo-Label)

- [ ] **Step 1: `buildBracket` um `finalLegsToWin` erweitern**

Aktuelle Funktion (Zeile 82-118) ersetzen durch:

```js
function buildBracket(teams,config){
  const n=teams.length;
  const bracketSize=Math.pow(2,Math.ceil(Math.log2(n)));
  const numRounds=Math.log2(bracketSize);
  const rounds=[];
  for(let r=0;r<numRounds;r++){
    const matchCount=bracketSize/Math.pow(2,r+1);
    const isFinal=r===numRounds-1;
    const isDoubleOut=isFinal&&config.finalDoubleOut;
    // finalLegsToWin ist optional (Default: config.legsToWin, also unverändertes
    // Verhalten für den bestehenden reinen K.o.-Modus) — nur die letzte Runde und
    // das Platz-3-Spiel nutzen ihn, analog zum bestehenden finalDoubleOut-Muster.
    const legsToWinHere=isFinal?(config.finalLegsToWin??config.legsToWin):config.legsToWin;
    const matches=[];
    for(let m=0;m<matchCount;m++){
      let t1=null,t2=null;
      if(r===0){
        if(n===bracketSize){
          // Keine Freilose nötig — alte Paarung (0v1, 2v3, …) unverändert lassen
          t1=m*2;t2=m*2+1;
        } else {
          // Standard-Seeding (1 vs. N, 2 vs. N-1, …) verteilt Freilose gleichmäßig, nie zwei pro Match
          const i1=m,i2=bracketSize-1-m;
          t1=i1<n?i1:null;
          t2=i2<n?i2:null;
        }
      }
      const match=newMatch(`r${r}m${m}`,t1,t2,r,false,isDoubleOut,legsToWinHere);
      if(r===0&&(t1===null)!==(t2===null))match.winner=t1!==null?t1:t2; // Freilos: kampflos weiter
      matches.push(match);
    }
    rounds.push({matches,name:ROUND_NAMES[numRounds]?.[r]||`Runde ${r+1}`,isDoubleOut,legsToWin:legsToWinHere});
  }
  // Third-place match — nur sinnvoll, wenn beide Halbfinal-Slots durch ein echtes Spiel entschieden werden;
  // war eines davon selbst ein Freilos (möglich bei numRounds===2, z.B. 3 Teams), gibt es keinen Verlierer dafür
  const semifinalRound=rounds[numRounds-2];
  const semifinalHasFreilos=semifinalRound?.matches.some(m=>m.winner!==null);
  if(config.thirdPlace&&numRounds>=2&&!semifinalHasFreilos){
    const thirdLegsToWin=config.finalLegsToWin??config.legsToWin;
    rounds.push({matches:[newMatch("3rd",null,null,numRounds,true,config.finalDoubleOut,thirdLegsToWin)],name:"Platz 3",isDoubleOut:config.finalDoubleOut,legsToWin:thirdLegsToWin});
  }
  return{teams:[...teams],rounds,config};
}
```

(Einzige Änderungen gegenüber vorher: `isFinal`/`legsToWinHere` berechnet und an `newMatch` durchgereicht statt immer `config.legsToWin`, sowie `legsToWin:legsToWinHere` bzw. `legsToWin:thirdLegsToWin` zusätzlich im `rounds.push(...)`-Objekt gespeichert, damit die UI in Step 3 pro Runde den richtigen Wert anzeigen kann.)

- [ ] **Step 2: Verifizieren, dass bestehendes Verhalten unverändert bleibt (Code-Review, kein Testframework für dart-turnier.jsx)**

`config.finalLegsToWin` wird aktuell nirgendwo gesetzt (kommt erst in Task 4) — `legsToWinHere` ist für jede Runde also immer `config.legsToWin` (der `??`-Fallback greift), identisch zum bisherigen Verhalten. Bestätigen durch kurzes Lesen von Step 1's Diff: der einzige Unterschied für den bestehenden Pfad ist ein zusätzliches `legsToWin`-Feld im Rundenobjekt (wird erst in Step 3 gelesen).

- [ ] **Step 3: Bracket-Header und TV-Header auf pro-Runde `legsToWin` umstellen**

In der Bracket-Ansicht (Hauptkomponente `DartTurnier`, aktuell Zeile 915-934), zwei Stellen ändern — `config.legsToWin` durch das Rundenobjekt ersetzen:

Zeile 919, alt:
```js
                <div style={{fontSize:10,color:textLow,marginTop:2}}>501 · {round.isDoubleOut?"Double Out":"Single Out"} · Bo{config.legsToWin*2-1}</div>
```
neu:
```js
                <div style={{fontSize:10,color:textLow,marginTop:2}}>501 · {round.isDoubleOut?"Double Out":"Single Out"} · Bo{round.legsToWin*2-1}</div>
```

Zeile 929, alt:
```js
              <div style={{fontSize:10,color:textLow,marginTop:2}}>501 · {thirdRound.isDoubleOut?"Double Out":"Single Out"} · Bo{config.legsToWin*2-1}</div>
```
neu:
```js
              <div style={{fontSize:10,color:textLow,marginTop:2}}>501 · {thirdRound.isDoubleOut?"Double Out":"Single Out"} · Bo{thirdRound.legsToWin*2-1}</div>
```

- [ ] **Step 4: `RulesModal` um den Finale-Sonderfall ergänzen**

Ersetzt die Funktion (aktuell Zeile 590-618):

```js
function RulesModal({config,onClose}){
  const bo=config.legsToWin*2-1;
  const finalLegsToWin=config.finalLegsToWin??config.legsToWin;
  const finalBo=finalLegsToWin*2-1;
  const hasStaggeredFinal=finalLegsToWin!==config.legsToWin;
  return(
    <Modal titleId="rules-title" onClose={onClose} maxWidth={440}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <h2 id="rules-title" style={{fontSize:14,fontWeight:700,color:textHi,fontFamily:F,margin:0}}>Turnier-Regeln</h2>
          <button onClick={onClose} aria-label="Schließen" style={{background:"none",border:"none",color:textLow,fontSize:22,cursor:"pointer",lineHeight:1,padding:"0 0 0 16px"}}>×</button>
        </div>
        <div style={{fontSize:11,color:textLow,lineHeight:1.9,fontFamily:F}}>
          <div style={{color:textMid,fontWeight:600,marginBottom:2,fontSize:10,letterSpacing:"0.06em"}}>SPIEL</div>
          <div>Jedes Leg startet bei <span style={{color:greenText}}>501</span> Punkten, runtergezählt bis exakt 0.</div>
          <div>Eine Aufnahme sind 3 Darts (weniger, wenn vorher schon exakt 0 erreicht).</div>
          <div>Geworfene Punkte werden direkt vom Rest abgezogen — höchste Kombination pro Aufnahme ist 180 (3× Triple 20).</div>
          <div>Rest unter 0 oder genau 1 (bei Double Out unmöglich fertigzuspielen) = <span style={{color:colRed}}>Bust</span>: die ganze Aufnahme zählt nicht, Rest bleibt wie vor dem Wurf.</div>
          <div style={{marginTop:12,color:textMid,fontWeight:600,marginBottom:2,fontSize:10,letterSpacing:"0.06em"}}>CHECKOUT</div>
          <div><span style={{color:green}}>Vorrunden — Single Out</span>: letzter Dart darf auf jedes Feld gehen, Hauptsache Rest exakt 0.</div>
          {config.finalDoubleOut&&<div><span style={{color:orange}}>Finale{config.thirdPlace?" & Spiel um Platz 3":""} — Double Out</span>: letzter Dart muss auf ein Doppelfeld oder Bullseye (Bull = 50, zählt als Doppel). Landet der letzte Dart auf Single/Triple statt Doppel obwohl Rest 0 wäre → ebenfalls Bust.</div>}
          <div style={{marginTop:12,color:textMid,fontWeight:600,marginBottom:2,fontSize:10,letterSpacing:"0.06em"}}>MATCH</div>
          <div>Best of {bo} Legs — wer zuerst <span style={{color:greenText}}>{config.legsToWin}</span> Legs gewinnt, gewinnt das Match{hasStaggeredFinal?" (Vorrunden & Halbfinale)":""}. Danach ist Schluss, auch wenn rechnerisch noch Legs offen wären.</div>
          {hasStaggeredFinal&&<div><span style={{color:greenText}}>{config.thirdPlace?"Finale & Spiel um Platz 3":"Finale"}</span>: Best of {finalBo} Legs — wer zuerst {finalLegsToWin} Legs gewinnt.</div>}
          <div>Wer im 1. Leg beginnt, wird vor dem Match festgelegt (Auswahl oder Zufall). Danach wechselt das Anwurfrecht nach jedem Leg.</div>
          <div style={{marginTop:12,color:textMid,fontWeight:600,marginBottom:2,fontSize:10,letterSpacing:"0.06em"}}>TURNIER</div>
          <div>K.-o.-System — einmal verloren bedeutet raus (außer Halbfinal-Verlierer, siehe unten).</div>
          <div>Paarungen werden vor Turnierstart zufällig ausgelost, auch die erste Runde.</div>
          <div>Freilos (bei ungerader Teamzahl) steigt ohne Spiel automatisch in die nächste Runde auf.</div>
          {config.thirdPlace&&<div>Beide Halbfinal-Verlierer spielen zusätzlich gegeneinander um Platz 3.</div>}
        </div>
    </Modal>
  );
}
```

- [ ] **Step 5: Manuell prüfen (bestehender K.o.-Modus unverändert)**

Dev-Server: Setup mit 4 Teams starten, "Regeln"-Modal öffnen (Fragezeichen-Button) — Text muss identisch zu vorher sein (kein "Finale & Spiel um Platz 3: Best of..."-Absatz, da `finalLegsToWin` noch nicht gesetzt wird). Bracket-Ansicht: "Bo3" muss weiterhin unter jeder Runde stehen.

- [ ] **Step 6: Commit**

```bash
cd /home/philipp/projects/dart
git add dart-turnier.jsx
git commit -m "$(cat <<'EOF'
Add optional finalLegsToWin to buildBracket (staggered format support)

Analog zum bestehenden finalDoubleOut-Muster: nur die letzte Runde und
das Platz-3-Spiel können ein abweichendes Best-of bekommen. Default
(unset) verhält sich exakt wie vorher — kein Verhaltensunterschied für
den bestehenden reinen K.o.-Modus. Wird ab Task 4 für die 8-Team-
Gruppenphase mit Best-of-5-Finale genutzt.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Gruppenphase — State, Persistenz, Scoring-Anbindung, `GroupOverview`

**Files:**
- Modify: `/home/philipp/projects/dart/dart-turnier.jsx` (mehrere Stellen in der `DartTurnier`-Hauptkomponente, `MatchCard`-Umgebung, neue `GroupOverview`-Komponente)

- [ ] **Step 1: `ResetConfirmModal` extrahieren (DRY-Vorbereitung — wird gleich zweimal gebraucht)**

Direkt vor `HelpModal` (nach der `Modal`-Definition, vor Zeile 545 `function HelpModal`) einfügen:

```js
function ResetConfirmModal({onCancel,onConfirm}){
  return(
    <Modal titleId="reset-title" onClose={onCancel} maxWidth={300} accent={colRed}>
      <div style={{textAlign:"center"}}>
        <h2 id="reset-title" style={{fontSize:13,fontWeight:700,color:textHi,marginBottom:8,fontFamily:F}}>Turnier zurücksetzen?</h2>
        <div style={{fontSize:11,color:textLow,marginBottom:20,fontFamily:F}}>Alle Ergebnisse und Daten gehen verloren.</div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={onCancel} style={{flex:1,padding:"10px 0",background:surf2,border:`1px solid ${bdr}`,borderRadius:8,color:textMid,fontSize:12,cursor:"pointer",fontFamily:F}}>Abbrechen</button>
          <button onClick={onConfirm} style={{flex:1,padding:"10px 0",background:colRedDk,border:`1px solid ${colRed}`,borderRadius:8,color:colRed,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:F}}>Zurücksetzen</button>
        </div>
      </div>
    </Modal>
  );
}
```

Im bestehenden Bracket-Render (aktuell Zeile 955-964) ersetzen:

```js
      {confirmReset&&<Modal titleId="reset-title" onClose={()=>setConfirmReset(false)} maxWidth={300} accent={colRed}>
        <div style={{textAlign:"center"}}>
          <h2 id="reset-title" style={{fontSize:13,fontWeight:700,color:textHi,marginBottom:8,fontFamily:F}}>Turnier zurücksetzen?</h2>
          <div style={{fontSize:11,color:textLow,marginBottom:20,fontFamily:F}}>Alle Ergebnisse und Daten gehen verloren.</div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>setConfirmReset(false)} style={{flex:1,padding:"10px 0",background:surf2,border:`1px solid ${bdr}`,borderRadius:8,color:textMid,fontSize:12,cursor:"pointer",fontFamily:F}}>Abbrechen</button>
            <button onClick={resetTournament} style={{flex:1,padding:"10px 0",background:colRedDk,border:`1px solid ${colRed}`,borderRadius:8,color:colRed,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:F}}>Zurücksetzen</button>
          </div>
        </div>
      </Modal>}
```

durch:

```js
      {confirmReset&&<ResetConfirmModal onCancel={()=>setConfirmReset(false)} onConfirm={resetTournament}/>}
```

- [ ] **Step 2: `GroupOverview`-Komponente hinzufügen**

Direkt nach `MatchCard` (nach Zeile 588, vor `function RulesModal`) einfügen:

```js
// ═══════════════════════════════════════════
// GROUP OVERVIEW (Gruppenphase-Screen: Tabellen + Spielliste)
// ═══════════════════════════════════════════
function GroupOverview({groupPhase,config,onOpen,onStartKo,onTvOverview,onShowHelp,onReset,theme,toggleTheme,tvBlocked,onDismissTvBlocked}){
  const table1=groupStandings(groupPhase.group1,[0,1,2,3]);
  const table2=groupStandings(groupPhase.group2,[4,5,6,7]);
  const complete=groupPhase.order.every(m=>m.winner!==null);
  const renderStandings=(table,title)=>(
    <div style={{background:card,border:`1px solid ${bdr}`,borderRadius:10,padding:"12px 14px",flex:1,minWidth:220}}>
      <div style={{fontSize:12,fontWeight:700,color:green,marginBottom:8}}>{title}</div>
      {table.map((r,i)=><div key={r.team} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderTop:i>0?`1px solid ${bdrSoft}`:"none"}}>
        <span style={{fontSize:12,color:i<2?textHi:textLow,fontWeight:i<2?700:400}}>{i+1}. {groupPhase.teams[r.team]}</span>
        <span className="score-num" style={{fontSize:11,color:textLow}}>{r.won}S · {r.legDiff>0?"+":""}{r.legDiff}</span>
      </div>)}
    </div>
  );
  return(
    <div style={{minHeight:"100vh",background:bg,color:textHi,fontFamily:F,padding:12,display:"flex",flexDirection:"column",gap:12}}>
      <GlobalStyles/>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
        <div>
          <h2 style={{fontFamily:FD,fontSize:18,fontWeight:800,color:textHi,letterSpacing:"-0.01em",margin:0}}>{config.name}</h2>
          <div style={{fontSize:11,color:textLow,marginTop:2}}>Gruppenphase</div>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <button onClick={onTvOverview} aria-label="TV-Übersicht öffnen" style={{background:colBlueDk,border:`1px solid ${colBlue}`,color:colBlue,borderRadius:6,padding:"7px 12px",cursor:"pointer",fontSize:11}}>📺 TV-Übersicht</button>
          <button onClick={onShowHelp} aria-label="Hilfe anzeigen" style={{background:surf2,border:`1px solid ${bdr}`,color:textLow,borderRadius:6,padding:"7px 12px",cursor:"pointer",fontSize:11}}>?</button>
          <button onClick={onReset} aria-label="Turnier zurücksetzen" style={{background:surf2,border:`1px solid ${bdr}`,color:textLow,borderRadius:6,padding:"7px 12px",cursor:"pointer",fontSize:11}}>Neu</button>
          <button onClick={toggleTheme} aria-label={theme==="dark"?"Zu Hellmodus wechseln":"Zu Dunkelmodus wechseln"} style={{background:surf2,border:`1px solid ${bdr}`,color:textMid,borderRadius:6,padding:"7px 10px",cursor:"pointer",fontSize:13}}>{theme==="dark"?"☀️":"🌙"}</button>
        </div>
      </div>

      {tvBlocked&&<div style={{background:colRedDk,border:`1px solid ${colRed}`,borderRadius:8,padding:"8px 14px",fontSize:11,color:colRed,display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
        <span>Browser hat das TV-Fenster blockiert (Popup-Blocker). Popups für diese Seite erlauben, dann nochmal auf "TV-Übersicht" klicken.</span>
        <button onClick={onDismissTvBlocked} aria-label="Hinweis schließen" style={{background:"none",border:"none",color:colRed,fontSize:14,cursor:"pointer",flexShrink:0}}>✕</button>
      </div>}

      <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
        {renderStandings(table1,"Gruppe 1")}
        {renderStandings(table2,"Gruppe 2")}
      </div>

      <button onClick={onStartKo} disabled={!complete} style={{padding:"14px 0",background:complete?green:surf2,color:complete?bg:textOff,border:"none",borderRadius:8,fontSize:14,fontWeight:700,cursor:complete?"pointer":"default",fontFamily:F}}>{complete?"Weiter zur KO-Phase":"Erst alle Gruppenspiele beenden"}</button>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:10}}>
        {groupPhase.order.map(m=><MatchCard key={m.id} match={m} teams={groupPhase.teams} onOpen={onOpen}/>)}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: State + Setup-Vorschau in `DartTurnier` ergänzen**

Zeile 721 (`const[bracket,setBracket]=useState(null);`) direkt danach ergänzen:

```js
  const[groupPhase,setGroupPhase]=useState(null);
```

Setup-Preview-Panel ersetzen — aktuell (Zeile 856-862):

```js
      <div style={{background:card,border:`1px solid ${bdr}`,borderRadius:10,padding:12,width:"100%",maxWidth:340}}>
        <p style={{color:textLow,fontSize:10,margin:0,lineHeight:1.6}}>
          <span style={{color:greenText}}>Vorrunden:</span> 501 Single Out · Best of {config.legsToWin*2-1}<br/>
          {config.finalDoubleOut&&<><span style={{color:orange}}>Finale:</span> 501 Double Out · Best of {config.legsToWin*2-1}<br/></>}
          {config.thirdPlace&&<><span style={{color:colBlue}}>Platz 3:</span> Verlierer der Halbfinals</>}
        </p>
      </div>
```

neu:

```js
      <div style={{background:card,border:`1px solid ${bdr}`,borderRadius:10,padding:12,width:"100%",maxWidth:340}}>
        {config.teamSize===8?(
          <p style={{color:textLow,fontSize:10,margin:0,lineHeight:1.6}}>
            <span style={{color:greenText}}>Gruppenphase (2×4 Teams):</span> 501 Single Out · Best of 3<br/>
            <span style={{color:orange}}>Halbfinale:</span> 501 Single Out · Best of 3<br/>
            <span style={{color:colBlue}}>Finale{config.thirdPlace?" & Platz 3":""}:</span> 501{config.finalDoubleOut?" Double Out":" Single Out"} · Best of 5
          </p>
        ):(
          <p style={{color:textLow,fontSize:10,margin:0,lineHeight:1.6}}>
            <span style={{color:greenText}}>Vorrunden:</span> 501 Single Out · Best of {config.legsToWin*2-1}<br/>
            {config.finalDoubleOut&&<><span style={{color:orange}}>Finale:</span> 501 Double Out · Best of {config.legsToWin*2-1}<br/></>}
            {config.thirdPlace&&<><span style={{color:colBlue}}>Platz 3:</span> Verlierer der Halbfinals</>}
          </p>
        )}
      </div>
```

- [ ] **Step 4: `startTournament` und `resetTournament` um Gruppenphase-Pfad erweitern**

Aktuell (Zeile 790-795):

```js
  const startTournament=()=>{
    const names=shuffle(teamNames.map((n,i)=>n.trim()||`Team ${i+1}`));
    const b=buildBracket(names,config);
    propagateBracket(b); // Freilose aus Runde 1 sofort weiterreichen
    setBracket(b);setPhase("bracket");
  };
```

neu:

```js
  const startTournament=()=>{
    const names=shuffle(teamNames.map((n,i)=>n.trim()||`Team ${i+1}`));
    if(config.teamSize===8){
      setBracket(null);setGroupPhase(buildGroups(names));setPhase("groups");
    } else {
      const b=buildBracket(names,config);
      propagateBracket(b); // Freilose aus Runde 1 sofort weiterreichen
      setGroupPhase(null);setBracket(b);setPhase("bracket");
    }
  };

  const startKoPhase=()=>{
    const table1=groupStandings(groupPhase.group1,[0,1,2,3]);
    const table2=groupStandings(groupPhase.group2,[4,5,6,7]);
    // Gekreuzt: Halbfinale 1 = Gruppe-1-Erster vs. Gruppe-2-Zweiter, Halbfinale 2 = Gruppe-2-Erster vs. Gruppe-1-Zweiter
    const koTeamIndices=[table1[0].team,table2[1].team,table2[0].team,table1[1].team];
    const koTeamNames=koTeamIndices.map(i=>groupPhase.teams[i]);
    const b=buildBracket(koTeamNames,{...config,finalLegsToWin:3,thirdPlace:true});
    propagateBracket(b);
    setBracket(b);setPhase("bracket");
  };
```

Aktuell (Zeile 809):

```js
  const resetTournament=()=>{clear();setBracket(null);setTeamNames(Array(config.teamSize).fill(""));setConfirmReset(false);setPhase("setup");};
```

neu:

```js
  const resetTournament=()=>{clear();setBracket(null);setGroupPhase(null);setTeamNames(Array(config.teamSize).fill(""));setConfirmReset(false);setPhase("setup");};
```

- [ ] **Step 5: Persistenz (Laden/Speichern/Live-Update) um `groupPhase` erweitern**

Aktuell (Zeile 730-739, Laden beim Start):

```js
  useEffect(()=>{(async()=>{
    const tvParam=new URLSearchParams(window.location.search).get('tv');
    const saved=await load();
    if(saved?.bracket){
      setBracket(saved.bracket);setConfig(saved.config||config);setSounds(saved.sounds||{});customSounds=saved.sounds||{};
      if(tvParam==='overview'){setPhase("tv-overview");}
      else if(tvParam){setActiveMatchId(tvParam);setPhase("tv");}
      else{setPhase("bracket");}
    } else{setTeamNames(Array(8).fill(""));setPhase("setup");}
  })();},[]);
```

neu:

```js
  useEffect(()=>{(async()=>{
    const tvParam=new URLSearchParams(window.location.search).get('tv');
    const saved=await load();
    if(saved?.bracket||saved?.groupPhase){
      setBracket(saved.bracket||null);setGroupPhase(saved.groupPhase||null);setConfig(saved.config||config);setSounds(saved.sounds||{});customSounds=saved.sounds||{};
      if(tvParam==='overview'){setPhase("tv-overview");}
      else if(tvParam){setActiveMatchId(tvParam);setPhase("tv");}
      else{setPhase(saved.bracket?"bracket":"groups");}
    } else{setTeamNames(Array(8).fill(""));setPhase("setup");}
  })();},[]);
```

Aktuell (Zeile 742-763, Live-Update wenn TV-Fenster offen ist):

```js
  useEffect(()=>{
    const tvParam=new URLSearchParams(window.location.search).get('tv');
    if(!tvParam)return;
    const onSt=(e)=>{
      if(e.key===THEME_KEY){if(e.newValue)setTheme(e.newValue);return;}
      if(e.key!==SK||!e.newValue)return;
      try{
        const s=JSON.parse(e.newValue);
        if(!s?.bracket)return;
        setBracket(s.bracket);
        // Falls das TV-Fenster schon offen war, bevor das Turnier gestartet wurde (noch auf "setup"
        // hängend), jetzt nachträglich in die TV-Ansicht wechseln statt für immer auf Setup zu bleiben
        setPhase(p=>{
          if(p!=="setup"&&p!=="loading")return p;
          return tvParam==='overview'?"tv-overview":"tv";
        });
        if(tvParam!=='overview')setActiveMatchId(tvParam);
      }catch(err){}
    };
    window.addEventListener('storage',onSt);
    return()=>window.removeEventListener('storage',onSt);
  },[]);
```

neu (einzige Änderung: `!s?.bracket` → `!s?.bracket&&!s?.groupPhase`, und beide States setzen):

```js
  useEffect(()=>{
    const tvParam=new URLSearchParams(window.location.search).get('tv');
    if(!tvParam)return;
    const onSt=(e)=>{
      if(e.key===THEME_KEY){if(e.newValue)setTheme(e.newValue);return;}
      if(e.key!==SK||!e.newValue)return;
      try{
        const s=JSON.parse(e.newValue);
        if(!s?.bracket&&!s?.groupPhase)return;
        setBracket(s.bracket||null);setGroupPhase(s.groupPhase||null);
        // Falls das TV-Fenster schon offen war, bevor das Turnier gestartet wurde (noch auf "setup"
        // hängend), jetzt nachträglich in die TV-Ansicht wechseln statt für immer auf Setup zu bleiben
        setPhase(p=>{
          if(p!=="setup"&&p!=="loading")return p;
          return tvParam==='overview'?"tv-overview":"tv";
        });
        if(tvParam!=='overview')setActiveMatchId(tvParam);
      }catch(err){}
    };
    window.addEventListener('storage',onSt);
    return()=>window.removeEventListener('storage',onSt);
  },[]);
```

Aktuell (Zeile 765, Speichern):

```js
  useEffect(()=>{if(bracket)save({bracket,config,sounds});},[bracket,config,sounds]);
```

neu:

```js
  useEffect(()=>{if(bracket||groupPhase)save({bracket,groupPhase,config,sounds});},[bracket,groupPhase,config,sounds]);
```

- [ ] **Step 6: Scoring-Anbindung — Matches auch in der Gruppenphase finden und aktualisieren**

Nach der Funktion `findLiveMatch` (aktuell Zeile 144-153, vor dem Abschnitt "STATS") einfügen:

```js
// Sucht ein Match sowohl im Bracket (K.o.) als auch in der Gruppenphase — ScoringView
// braucht dieselbe {match,round}-Form unabhängig davon, woher das Match kommt.
function findMatchAnywhere(bracket,groupPhase,id){
  if(bracket){const r=getMatch(bracket,id);if(r)return{...r,teams:bracket.teams};}
  if(groupPhase){
    const m=groupPhase.order.find(x=>x.id===id);
    if(m)return{match:m,round:{name:groupPhase.group1.includes(m)?"Gruppe 1":"Gruppe 2",isDoubleOut:false},teams:groupPhase.teams};
  }
  return null;
}
```

In `DartTurnier`, `handleUpdate` (aktuell Zeile 805-807):

```js
  const handleUpdate=(updatedMatch)=>{
    setBracket(prev=>{const b=structuredClone(prev);setMatchIn(b,updatedMatch);propagateBracket(b);return b;});
  };
```

neu:

```js
  const handleUpdate=(updatedMatch)=>{
    if(bracket&&getMatch(bracket,updatedMatch.id)){
      setBracket(prev=>{const b=structuredClone(prev);setMatchIn(b,updatedMatch);propagateBracket(b);return b;});
    } else if(groupPhase){
      setGroupPhase(prev=>{
        const gp=structuredClone(prev);
        const replace=(arr)=>{const i=arr.findIndex(x=>x.id===updatedMatch.id);if(i!==-1)arr[i]=updatedMatch;};
        replace(gp.group1);replace(gp.group2);replace(gp.order);
        return gp;
      });
    }
  };
```

Scoring/TV-Render (aktuell Zeile 870-874):

```js
  if((phase==="scoring"||phase==="tv")&&bracket&&activeMatchId){
    const result=getMatch(bracket,activeMatchId);
    if(!result)return null;
    return<><GlobalStyles/><ScoringView match={result.match} teams={bracket.teams} roundName={result.round.name} isDoubleOut={result.round.isDoubleOut} onBack={back} onUpdate={handleUpdate} isTV={phase==="tv"} legsToWin={bracket.config.legsToWin}/></>;
  }
```

neu:

```js
  if((phase==="scoring"||phase==="tv")&&(bracket||groupPhase)&&activeMatchId){
    const result=findMatchAnywhere(bracket,groupPhase,activeMatchId);
    if(!result)return null;
    return<><GlobalStyles/><ScoringView match={result.match} teams={result.teams} roundName={result.round.name} isDoubleOut={result.round.isDoubleOut} onBack={back} onUpdate={handleUpdate} isTV={phase==="tv"}/></>;
  }
```

(`legsToWin`-Prop entfernt: sie wurde in `ScoringView` nirgends gelesen — reiner Altlast-Prop, siehe `grep -n legsToWin dart-turnier.jsx` — das eigentliche Best-of steckt in `match.game`, das schon beim Erzeugen des Matches korrekt konfiguriert wurde.)

- [ ] **Step 7: `phase==="groups"`-Render einhängen**

Direkt vor dem Kommentar `// ── BRACKET ──` (aktuell Zeile 882) einfügen:

```js
  // ── GRUPPENPHASE ──
  if(phase==="groups"&&groupPhase)return<>
    <GroupOverview groupPhase={groupPhase} config={config} onOpen={openMatch} onStartKo={startKoPhase} onTvOverview={openTvOverview} onShowHelp={()=>setShowHelp(true)} onReset={()=>setConfirmReset(true)} theme={theme} toggleTheme={toggleTheme} tvBlocked={tvBlocked} onDismissTvBlocked={()=>setTvBlocked(false)}/>
    {showHelp&&<HelpModal onClose={()=>setShowHelp(false)}/>}
    {confirmReset&&<ResetConfirmModal onCancel={()=>setConfirmReset(false)} onConfirm={resetTournament}/>}
  </>;

```

- [ ] **Step 8: Manuell durchspielen**

Dev-Server: Setup → Teamanzahl auf 8 stellen (Stepper) → 8 Teams benennen (oder leer lassen für "Team N") → "Turnier starten". Erwartet: Gruppenphase-Screen mit 2 Tabellen (noch leer/0 Siege) und 12 Match-Karten in der Reihenfolge G1,G2,G1,G2,... Ein Gruppenspiel öffnen, ein Leg zu Ende spielen (2 Legs für eine Seite eintragen) → zurück zur Gruppenübersicht, Tabelle muss den Sieg zeigen. "Weiter zur KO-Phase"-Button muss deaktiviert bleiben, bis alle 12 Spiele fertig sind.

- [ ] **Step 9: Commit**

```bash
cd /home/philipp/projects/dart
git add dart-turnier.jsx
git commit -m "$(cat <<'EOF'
Add Gruppenphase state, persistence and GroupOverview UI

Neuer phase==="groups"-Zustand für teamSize===8: buildGroups() beim
Start, GroupOverview zeigt Tabellen (Legdiff-Tiebreak) + die 12
Gruppenspiele in alternierender Reihenfolge, "Weiter zur KO-Phase"
baut über groupStandings() die gekreuzte Paarung und ruft das
bestehende buildBracket() mit finalLegsToWin:3 auf. Scoring/Persistenz
arbeiten jetzt über beide Datenmodelle (Bracket ODER Gruppenphase).
Bestehender reiner K.o.-Modus (teamSize!==8) unverändert.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: TV-Unterstützung für die Gruppenphase

**Files:**
- Modify: `/home/philipp/projects/dart/dart-turnier.jsx` (`TvAuto`, neue `TvGroupOverview`-Komponente, Aufrufstelle in `DartTurnier`)

- [ ] **Step 1: `findLiveGroupMatch` ergänzen**

Direkt nach `findLiveMatch` (bzw. nach `findMatchAnywhere` aus Task 3, Step 6) einfügen:

```js
function findLiveGroupMatch(groupPhase){
  for(const m of groupPhase.order){
    const started=m.started||m.game.turns.length>0||m.game.legResults.length>0;
    if(started&&m.winner===null)return m;
  }
  return null;
}
```

- [ ] **Step 2: `TvGroupOverview`-Komponente hinzufügen**

Nach `TvOverview` (aktuell nach Zeile 684, vor der `TvAuto`-Funktion) einfügen:

```js
function TvGroupOverview({groupPhase}){
  const table1=groupStandings(groupPhase.group1,[0,1,2,3]);
  const table2=groupStandings(groupPhase.group2,[4,5,6,7]);
  const renderTable=(table,title)=>(
    <div style={{flex:1,minWidth:280}}>
      <div style={{textAlign:"center",paddingBottom:6,borderBottom:`2px solid ${bdrSoft}`,fontSize:16,fontWeight:700,color:green}}>{title}</div>
      <div style={{display:"flex",flexDirection:"column",gap:2,marginTop:10}}>
        {table.map((r,i)=><div key={r.team} style={{display:"flex",justifyContent:"space-between",padding:"8px 12px",background:i<2?greenDark:card,borderRadius:8}}>
          <span style={{fontSize:15,fontWeight:i<2?700:500,color:i<2?greenText:textHi}}>{i+1}. {groupPhase.teams[r.team]}</span>
          <span className="score-num" style={{fontSize:14,color:textLow}}>{r.won}S · {r.legDiff>0?"+":""}{r.legDiff}</span>
        </div>)}
      </div>
    </div>
  );
  return(
    <div style={{minHeight:"100vh",background:bg,color:textHi,fontFamily:F,padding:"24px 32px",display:"flex",flexDirection:"column",gap:20}}>
      <GlobalStyles/>
      <h2 style={{fontFamily:FD,fontSize:28,fontWeight:800,margin:0}}>Gruppenphase</h2>
      <div style={{display:"flex",gap:24,flexWrap:"wrap"}}>
        {renderTable(table1,"Gruppe 1")}
        {renderTable(table2,"Gruppe 2")}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:14}}>
        {groupPhase.order.map(m=><TvMatchCard key={m.id} match={m} teams={groupPhase.teams}/>)}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `TvAuto` auf Bracket ODER Gruppenphase umstellen**

Aktuelle Funktion (Zeile 689-710) ersetzen durch:

```js
function TvAuto({bracket,groupPhase,config,theme,toggleTheme}){
  const[pinnedId,setPinnedId]=useState(null);
  const[showRules,setShowRules]=useState(false);
  const live=bracket
    ?findLiveMatch(bracket)
    :(groupPhase?(m=>m?{match:m,round:{name:groupPhase.group1.includes(m)?"Gruppe 1":"Gruppe 2",isDoubleOut:false}}:null)(findLiveGroupMatch(groupPhase)):null);

  useEffect(()=>{
    if(live){setPinnedId(live.match.id);return;}
    if(pinnedId){const t=setTimeout(()=>setPinnedId(null),5000);return()=>clearTimeout(t);}
  },[bracket,groupPhase]);

  const findPinned=()=>{
    if(!pinnedId)return null;
    return findMatchAnywhere(bracket,groupPhase,pinnedId);
  };
  const focus=live||findPinned();
  // Nur Buttons, ohne eigene Positionierung — Aufrufer entscheidet, ob fixed (Übersicht, hat
  // keinen eigenen Header) oder eingereiht (Live-Match, hat schon einen Header mit ✕-Button an
  // derselben Ecke — fixed hätte sich früher damit überlagert).
  const buttons=<>
    <button onClick={()=>setShowRules(true)} aria-label="Regeln anzeigen" style={{background:surf2,border:`1px solid ${bdr}`,color:textMid,borderRadius:6,padding:"7px 10px",cursor:"pointer",fontSize:13}}>📜 Regeln</button>
    <button onClick={toggleTheme} aria-label={theme==="dark"?"Zu Hellmodus wechseln":"Zu Dunkelmodus wechseln"} style={{background:surf2,border:`1px solid ${bdr}`,color:textMid,borderRadius:6,padding:"7px 10px",cursor:"pointer",fontSize:13}}>{theme==="dark"?"☀️":"🌙"}</button>
  </>;
  // bracket.config trägt das tatsächlich verwendete finalLegsToWin/thirdPlace (wie beim
  // Aufruf von buildBracket() in startKoPhase gesetzt) — das plain config-Prop hat das nicht,
  // ist aber die richtige Quelle während der Gruppenphase (noch kein bracket vorhanden).
  const rules=showRules&&<RulesModal config={bracket?bracket.config:config} onClose={()=>setShowRules(false)}/>;
  if(focus)return<><GlobalStyles/>{rules}<ScoringView match={focus.match} teams={focus.teams||(bracket?bracket.teams:groupPhase.teams)} roundName={focus.round.name} isDoubleOut={focus.round.isDoubleOut} onBack={()=>{}} onUpdate={()=>{}} isTV={true} tvControls={buttons}/></>;
  const overview=bracket?<TvOverview bracket={bracket}/>:<TvGroupOverview groupPhase={groupPhase}/>;
  return<><div style={{position:"fixed",top:16,right:16,zIndex:150,display:"flex",gap:8}}>{buttons}</div>{rules}{overview}</>;
}
```

- [ ] **Step 4: Aufrufstelle in `DartTurnier` anpassen**

Aktuell (Zeile 867):

```js
  if(phase==="tv-overview"&&bracket)return<TvAuto bracket={bracket} theme={theme} toggleTheme={toggleTheme}/>;
```

neu:

```js
  if(phase==="tv-overview"&&(bracket||groupPhase))return<TvAuto bracket={bracket} groupPhase={groupPhase} config={config} theme={theme} toggleTheme={toggleTheme}/>;
```

- [ ] **Step 5: Manuell prüfen**

Dev-Server: Gruppenphase mit 8 Teams starten (wie Task 3, Step 8), auf "📺 TV-Übersicht" klicken → neues Fenster muss die beiden Gruppentabellen + alle 12 Match-Karten zeigen. Ein Gruppenspiel im Haupt-Tab öffnen und einen Wurf eintragen → TV-Fenster muss automatisch ins laufende Match springen (wie beim bestehenden K.o.-Modus). Nach "Weiter zur KO-Phase": TV-Fenster muss automatisch zur normalen Bracket-TV-Ansicht wechseln (weil `bracket` jetzt gesetzt ist).

- [ ] **Step 6: Commit**

```bash
cd /home/philipp/projects/dart
git add dart-turnier.jsx
git commit -m "$(cat <<'EOF'
Add TV support for Gruppenphase (TvGroupOverview + TvAuto dual-mode)

TvAuto arbeitet jetzt sowohl mit bracket als auch groupPhase: zeigt
Gruppentabellen + Spielliste, springt bei laufendem Spiel automatisch
rein (wie im bestehenden K.o.-Modus), und wechselt nach dem KO-Übergang
nahtlos zur bestehenden Bracket-TV-Ansicht, weil dort einfach bracket
gesetzt wird.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: End-to-End-Verifikation und Abschluss

**Files:** keine Code-Änderungen — reine Verifikation.

- [ ] **Step 1: Komplettes Turnier von vorne bis hinten durchspielen**

Dev-Server, frisches Storage (Browser-Devtools → Application → Local Storage leeren, oder "Neu" im laufenden Turnier nutzen):

1. Setup: Teamanzahl 8, alle 8 Teams benennen, "Finale: Double Out" an lassen, "Spiel um Platz 3" an lassen, Turnier starten.
2. Gruppenphase: alle 12 Spiele durchspielen (pro Spiel: Anwurf wählen, Legs bis 2:0 oder 2:1 eintragen — schnell testbar über die Numpad-Eingabe mit hohen Zahlen, z.B. wiederholt 180 bis Rest ≤ 40, dann exakten Rest eintippen).
3. Tabellen prüfen: Platzierung muss nach Siegen, bei Gleichstand nach Legdifferenz stimmen.
4. "Weiter zur KO-Phase" — Bracket muss mit den 4 richtigen Teams in der gekreuzten Reihenfolge erscheinen (Gruppe-1-Erster oben links, etc.), Header muss "Bo3" für Halbfinale und "Bo5" für Finale/Platz 3 zeigen.
5. Halbfinale + Finale + Spiel um Platz 3 durchspielen — Finale muss bei Double Out tatsächlich ein Doppelfeld zum Checkout verlangen (Single-Out-Eingabe auf ein Non-Double bei Rest 0 muss Bust auslösen).
6. Turniersieger-Anzeige in der Sidebar muss erscheinen.

- [ ] **Step 2: Bestehenden reinen K.o.-Modus gegenprüfen (Regressionscheck)**

"Neu" → Teamanzahl auf z.B. 6 stellen, Turnier starten. Muss weiterhin direkt ins Bracket gehen (kein Gruppenphase-Screen), Regeln-Modal zeigt keinen "Finale & Platz 3: Best of..."-Zusatzabsatz, Bo-Label bleibt für jede Runde gleich.

- [ ] **Step 3: `npm test` — bestehende Engine-Suiten müssen weiterhin grün sein**

Run: `cd /home/philipp/projects/dart && npm test`
Expected: alle vier Suiten (`engine`, `logger`, `tournament`, `groups`) laufen durch, `0 failed` in jeder.

- [ ] **Step 4: Branch-Status prüfen**

```bash
cd /home/philipp/projects/dart && git status --short && git log --oneline feature/gruppenphase-saetze-turnier ^master
```

Erwartet: sauberer Working Tree, alle Commits aus Task 1-4 sichtbar, `feature/gruppenphase-saetze-turnier` ist gegenüber `master` nur um diese Commits + die beiden Spec-Commits von vorher voraus.

---

## Nach Abschluss

Branch `feature/gruppenphase-saetze-turnier` ist bereit für Review/Merge — kein PR-Zwang, da Solo-Projekt, aber laut Projekt-Konvention (jedes Feature in eigenem Branch, siehe Memory) nicht direkt auf `master` mergen ohne kurzen Blick über den Diff. `feature/gruppenphase` (16.08., anderer Ansatz) bleibt unangetastet liegen.
