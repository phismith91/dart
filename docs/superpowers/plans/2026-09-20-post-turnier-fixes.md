# Post-Turnier-Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sechs reale Turnier-Rückmeldungen fixen: Crash bei Zurück in der
Gruppenphase, fehlerhafte Team-Karten-Interaktion, unklare Undo-Buttons,
schwache Single-Out-Checkout-Vorschläge, fehlende 301-Option, unklare
Feld-Reihenfolge im Darts-Tab.

**Architecture:** Drei unabhängige Tasks. Task 1 bündelt vier rein
mechanische UI-Fixes in `dart-turnier.jsx` (keine neue Logik, nur
bestehenden Code korrigieren/umbenennen). Task 2 baut eine echte
Pfadsuche für Single-Out-Checkouts in `src/checkouts.js`. Task 3 zieht
`startScore` als Config-Parameter durch `groups.js` und `dart-turnier.jsx`.

**Tech Stack:** React 18 (JSX, kein Build-Test-Harness), zero-dep
Vanilla-JS-Engine unter `src/` mit eigenem Test-Runner (`node
tests/*.test.js`).

---

### Task 1: Mechanische UI-Fixes (Crash, Team-Karte, Undo-Labels, Feld-Reihenfolge)

**Files:**
- Modify: `dart-turnier.jsx`

- [ ] **Step 1: Crash-Fix in `back()`**

Datei `dart-turnier.jsx`, Zeile 1013. Aktuell:

```js
  const back=()=>{setActiveMatchId(null);setPhase("bracket");};
```

Ersetzen durch:

```js
  const back=()=>{setActiveMatchId(null);setPhase(bracket?"bracket":"groups");};
```

- [ ] **Step 2: Team-Karten in `ScoringView` von `button` auf reine Anzeige umstellen**

Datei `dart-turnier.jsx`, im Bereich um Zeile 521 (Header-Bereich von
`ScoringView`, der `sides.map(...)`-Block). Aktuell:

```js
        {sides.map(({p,name,r,h,s,co})=><button key={p} onClick={()=>setAp(p)} aria-label={`${name}, Rest: ${r}`} aria-pressed={ap===p} style={{flex:1,padding:"8px 6px",borderRadius:10,background:ap===p?greenDark:card,border:`2px solid ${ap===p?green:bdr}`,display:"flex",flexDirection:"column",width:"100%"}}>
```

Ersetzen durch (kein `onClick`/`aria-pressed` mehr, `button`→`div`,
Rest der Zeile inkl. schließendem Tag unverändert):

```js
        {sides.map(({p,name,r,h,s,co})=><div key={p} aria-label={`${name}, Rest: ${r}`} style={{flex:1,padding:"8px 6px",borderRadius:10,background:ap===p?greenDark:card,border:`2px solid ${ap===p?green:bdr}`,display:"flex",flexDirection:"column",width:"100%"}}>
```

Das schließende `</button>` dieses Blocks (Ende derselben JSX-Zeile, vor
dem `)` von `.map(...)`) wird zu `</div>`. Kein anderer Teil des
Blockinhalts ändert sich — `ap` wird weiterhin nur automatisch gesetzt
(in `applyThrowResult`, `undoThrow`, `undoLeg`, `selectStarter`), nie
mehr per Klick.

- [ ] **Step 3: Undo-Buttons sichtbar beschriften**

Datei `dart-turnier.jsx`, Header-Zeile um 517-518. Aktuell:

```js
        <button onClick={undoThrow} aria-label="Letzten Wurf zurücknehmen" style={{background:surf2,border:`1px solid ${bdr}`,borderRadius:6,color:orange,fontSize:13,padding:"0 14px",cursor:"pointer",fontFamily:F,marginRight:4}}>↩</button>
        {match.game.legResults.length>0&&<button onClick={undoLeg} aria-label="Letztes Leg zurücknehmen" style={{background:surf2,border:`1px solid ${bdr}`,borderRadius:6,color:colRed,fontSize:11,padding:"0 10px",cursor:"pointer",fontFamily:F}}>↩L</button>}
```

Ersetzen durch:

```js
        <button onClick={undoThrow} aria-label="Letzte Aufnahme zurücknehmen" title="Letzte Aufnahme zurücknehmen" style={{background:surf2,border:`1px solid ${bdr}`,borderRadius:6,color:orange,fontSize:12,fontWeight:600,padding:"0 10px",cursor:"pointer",fontFamily:F,marginRight:4,whiteSpace:"nowrap"}}>Wurf ↩</button>
        {match.game.legResults.length>0&&<button onClick={undoLeg} aria-label="Letztes Leg zurücknehmen" title="Letztes Leg zurücknehmen" style={{background:surf2,border:`1px solid ${bdr}`,borderRadius:6,color:colRed,fontSize:11,fontWeight:600,padding:"0 10px",cursor:"pointer",fontFamily:F,whiteSpace:"nowrap"}}>Leg ↩</button>}
```

Datei `dart-turnier.jsx`, Darts-Tab-Undo-Button um Zeile 504. Aktuell:

```js
        <button onClick={()=>darts.length&&setDarts(darts.slice(0,-1))} disabled={!darts.length} aria-label="Letzten Dart entfernen" style={{flex:1,padding:"0",background:surf2,border:`1px solid ${bdr}`,borderRadius:8,color:darts.length?orange:textOff,fontSize:14,fontFamily:F}}>↩</button>
```

Ersetzen durch:

```js
        <button onClick={()=>darts.length&&setDarts(darts.slice(0,-1))} disabled={!darts.length} aria-label="Letzten Dart entfernen" title="Zuletzt eingegebenen Dart entfernen" style={{flex:1,padding:"0",background:surf2,border:`1px solid ${bdr}`,borderRadius:8,color:darts.length?orange:textOff,fontSize:12,fontWeight:600,fontFamily:F,whiteSpace:"nowrap"}}>Dart ↩</button>
```

- [ ] **Step 4: Feld-Reihenfolge im Darts-Tab auf echte absteigende Paare umstellen**

Datei `dart-turnier.jsx`, `renderDarts()`-Closure, aktuell (um Zeile
466-467, 474-482, 488-491):

```js
    const highFields=[20,19,18,17,16,15,14,13,12,11];
    const lowFields=[10,9,8,7,6,5,4,3,2,1];
```

und weiter unten:

```js
    const renderHalf=(list)=><div style={{display:"flex",flexDirection:"column",gap:3,flex:1}}>
      {halfHeader}
      {list.map(f=><div key={f} style={{display:"grid",gridTemplateColumns:"20px 1fr 1fr 1fr",gap:3,alignItems:"center"}}>
        <div style={{fontSize:10,color:textLow,textAlign:"right",paddingRight:2}}>{f}</div>
        {cell(f,"S",f)}
        {cell(f,"D",f*2)}
        {cell(f,"T",f*3)}
      </div>)}
    </div>;
```

```js
      <div style={{display:"flex",gap:6}}>
        {renderHalf(highFields)}
        {renderHalf(lowFields)}
      </div>
```

Ersetzen durch (eine Spalte pro "Zeilenspalte" der Paare, Werte in
jeder Spalte absteigend um 2 statt um 1 — Spalte A: 20,18,16,...,2;
Spalte B: 19,17,15,...,1 — dadurch liest sich Zeile für Zeile
durchgehend 20,19,18,17,...,2,1):

```js
    const colA=[20,18,16,14,12,10,8,6,4,2];
    const colB=[19,17,15,13,11,9,7,5,3,1];
```

```js
    const renderCol=(list)=><div style={{display:"flex",flexDirection:"column",gap:3,flex:1}}>
      {halfHeader}
      {list.map(f=><div key={f} style={{display:"grid",gridTemplateColumns:"20px 1fr 1fr 1fr",gap:3,alignItems:"center"}}>
        <div style={{fontSize:10,color:textLow,textAlign:"right",paddingRight:2}}>{f}</div>
        {cell(f,"S",f)}
        {cell(f,"D",f*2)}
        {cell(f,"T",f*3)}
      </div>)}
    </div>;
```

```js
      <div style={{display:"flex",gap:6}}>
        {renderCol(colA)}
        {renderCol(colB)}
      </div>
```

(`highFields`/`lowFields`/`renderHalf` werden komplett durch
`colA`/`colB`/`renderCol` ersetzt, keine Restverwendung der alten Namen
darf übrig bleiben.)

- [ ] **Step 5: Verifizieren**

```bash
npx esbuild dart-turnier.jsx --bundle --loader:.jsx=jsx --external:react --external:react-dom --external:tone --outfile=/dev/null
npm test
```

Erwartet: esbuild ohne Fehler, `npm test` weiterhin 178/178 grün
(dieser Task ändert nur `dart-turnier.jsx`, keine `src/`-Logik).

- [ ] **Step 6: Commit**

```bash
git add dart-turnier.jsx
git commit -m "Fix Gruppenphase-Zurück-Crash, Team-Karten-Fehlbuchung, Undo-Beschriftung, Darts-Feldreihenfolge

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Echte Single-Out-Checkout-Pfade

**Files:**
- Modify: `src/checkouts.js`
- Modify: `dart-turnier.jsx`
- Modify: `tests/engine.test.js`

- [ ] **Step 1: Pfadsuche + neuer `'single'`-Zweig in `getCheckout()`**

Datei `src/checkouts.js`. Nach der bestehenden `singleDartFor`-Funktion
(vor `getCheckout`) einfügen:

```js
/** Sortierte 1-Dart-Werte, absteigend — Basis für die Single-Out-Pfadsuche. */
const SORTED_DART_VALUES = [...SINGLE_DART_VALUES].filter(v => v > 0).sort((a, b) => b - a);

/**
 * Findet einen gültigen Single-Out-Pfad (kein Doppel-Zwang auf dem letzten
 * Dart) mit möglichst wenigen Darts, greedy von oben nach unten. Liefert
 * `null`, wenn der Rest mit `dartsLeft` Darts nicht exakt auf 0 geht
 * (z.B. echte Bogey-Zahlen wie 178).
 */
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

In `getCheckout()` den kompletten `if (mode === 'single') { ... }`-Block
(aktuell):

```js
  if (mode === 'single') {
    // Nur echte Ein-Dart-Werte (1-20, 25, 50 sowie deren Doppel/Triple) vorschlagen —
    // "S52" o.ä. existiert nicht (kein Feld auf der Scheibe hat diesen Wert).
    if (remaining <= 60 && dartsLeft >= 1 && SINGLE_DART_VALUES.has(remaining)) {
      const dart = singleDartFor(remaining);
      return { path: dartLabel(dart.field, dart.multiplier), darts: 1 };
    }
    if (remaining <= 120 && dartsLeft >= 2) return { path: `setup + finish`, darts: 2 };
    if (remaining <= 180 && dartsLeft >= 3) return { path: `setup + finish`, darts: 3 };
    return null;
  }
```

ersetzen durch:

```js
  if (mode === 'single') {
    const path = singleOutPath(remaining, Math.min(dartsLeft, 3));
    if (!path) return null;
    const labels = path.map(v => { const d = singleDartFor(v); return dartLabel(d.field, d.multiplier); });
    return { path: labels.join(' '), darts: path.length };
  }
```

- [ ] **Step 2: Toten Placeholder-Filter in `dart-turnier.jsx` entfernen**

Datei `dart-turnier.jsx`, Zeile 70-73. Aktuell:

```js
function checkoutSuggestion(rem,isDoubleOut){
  const co=engineGetCheckout(rem,isDoubleOut?"double":"single");
  return co&&co.path!=="setup + finish"?co.path:null;
}
```

Ersetzen durch:

```js
function checkoutSuggestion(rem,isDoubleOut){
  const co=engineGetCheckout(rem,isDoubleOut?"double":"single");
  return co?co.path:null;
}
```

- [ ] **Step 3: Regressionstests**

Datei `tests/engine.test.js`. Die bestehenden Checkout-Tests (aus dem
letzten Bugfix, u.a. `eq(getCheckout(60, 'single')?.path, 'T20', ...)`)
bleiben unverändert gültig (60 ist weiterhin ein 1-Dart-Wert). Neue
Tests direkt danach ergänzen (gleiche `suite`/`eq`-Helper wie im Rest
der Datei):

```js
eq(getCheckout(52, 'single')?.path, 'T20 D16', '52 SO 2-dart');
eq(getCheckout(52, 'single')?.darts, 2, '52 SO 2 darts');
eq(getCheckout(100, 'single')?.path, 'T20 D20', '100 SO 2-dart');
eq(getCheckout(121, 'single')?.path, 'T20 T20 S1', '121 SO 3-dart');
eq(getCheckout(178, 'single'), null, '178 echter Bogey, auch Single Out unmöglich');
eq(getCheckout(23, 'single', 1)?.path, undefined, '23 mit nur 1 Dart uebrig unerreichbar');
```

- [ ] **Step 4: Tests ausführen, ggf. Pfade an tatsächliche Ausgabe anpassen**

```bash
node tests/engine.test.js
```

Falls die Greedy-Suche für einen der Beispielwerte einen anderen
(ebenfalls korrekten) Pfad liefert als oben notiert — die Implementer-
Subagent-Instanz führt den Test zuerst aus und passt die erwarteten
Strings an die tatsächliche (verifiziert korrekte) Ausgabe an, statt die
Logik zu verbiegen. Kriterium für "korrekt": Summe der Dart-Werte im
Pfad ergibt exakt den Rest, jeder einzelne Wert ist ein echter
Dartfeld-Wert.

Danach volle Suite:

```bash
npm test
```

Erwartet: alle Suiten grün, keine Regression in `groups.test.js`
(unberührt) oder `tournament.test.js`/`logger.test.js` (unberührt).

- [ ] **Step 5: Commit**

```bash
git add src/checkouts.js dart-turnier.jsx tests/engine.test.js
git commit -m "Echte Single-Out-Checkout-Pfade statt Platzhalter (Gruppenphase/Halbfinale)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: 301-Option

**Files:**
- Modify: `groups.js`
- Modify: `dart-turnier.jsx`
- Test: `tests/groups.test.js` (falls `newMatch`/`buildGroups`-Signatur dort direkt geprüft wird — vorher lesen)

- [ ] **Step 1: `startScore` durch `groups.js` durchreichen**

Datei `groups.js`, Zeile 11-14. Aktuell:

```js
export function newMatch(id,t1,t2,roundIdx,isThirdPlace=false,isDoubleOut=false,legsToWin=2){
  return{id,t1,t2,roundIdx,isThirdPlace,winner:null,started:false,
    game:createGame({startScore:501,checkoutMode:isDoubleOut?"double":"single",legsToWin,dartsPerTurn:3})};
}
```

Ersetzen durch:

```js
export function newMatch(id,t1,t2,roundIdx,isThirdPlace=false,isDoubleOut=false,legsToWin=2,startScore=501){
  return{id,t1,t2,roundIdx,isThirdPlace,winner:null,started:false,
    game:createGame({startScore,checkoutMode:isDoubleOut?"double":"single",legsToWin,dartsPerTurn:3})};
}
```

Zeile 36-50 (`buildGroups`), aktuell:

```js
export function buildGroups(teams){
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
```

Ersetzen durch:

```js
export function buildGroups(teams,startScore=501){
  const buildGroupMatches=(groupTeams,groupIdx)=>{
    const rounds=roundRobinPairs4(groupTeams);
    const matches=[];
    rounds.forEach((pairs,r)=>pairs.forEach(([t1,t2],m)=>{
      matches.push(newMatch(`g${groupIdx}r${r}m${m}`,t1,t2,r,false,false,2,startScore));
    }));
    return matches;
  };
  const group1=buildGroupMatches([0,1,2,3],1);
  const group2=buildGroupMatches([4,5,6,7],2);
  const order=[];
  for(let i=0;i<6;i++){order.push(group1[i]);order.push(group2[i]);}
  return{teams:[...teams],group1,group2,order};
}
```

- [ ] **Step 2: `tests/groups.test.js` prüfen**

```bash
node tests/groups.test.js
```

Falls die Datei `newMatch`/`buildGroups` mit fester Argumentzahl
aufruft, laufen bestehende Aufrufe unverändert weiter (neue Parameter
haben Defaults) — Test muss ohne Änderung grün bleiben. Nur bei
tatsächlichem Fehlschlag anpassen (nicht vorsorglich ändern).

- [ ] **Step 3: `buildBracket` und `startTournament` in `dart-turnier.jsx` anpassen**

Datei `dart-turnier.jsx`, Zeile 102. Aktuell:

```js
      const match=newMatch(`r${r}m${m}`,t1,t2,r,false,isDoubleOut,legsToWinHere);
```

Ersetzen durch:

```js
      const match=newMatch(`r${r}m${m}`,t1,t2,r,false,isDoubleOut,legsToWinHere,config.startScore);
```

Zeile 114. Aktuell:

```js
    rounds.push({matches:[newMatch("3rd",null,null,numRounds,true,config.finalDoubleOut,thirdLegsToWin)],name:"Platz 3",isDoubleOut:config.finalDoubleOut,legsToWin:thirdLegsToWin});
```

Ersetzen durch:

```js
    rounds.push({matches:[newMatch("3rd",null,null,numRounds,true,config.finalDoubleOut,thirdLegsToWin,config.startScore)],name:"Platz 3",isDoubleOut:config.finalDoubleOut,legsToWin:thirdLegsToWin});
```

Zeile 988 (in `startTournament`). Aktuell:

```js
      setBracket(null);setGroupPhase(buildGroups(names));setPhase("groups");
```

Ersetzen durch:

```js
      setBracket(null);setGroupPhase(buildGroups(names,config.startScore));setPhase("groups");
```

- [ ] **Step 4: Config-Default + Setup-UI-Umschalter**

Datei `dart-turnier.jsx`, Zeile 911. Aktuell:

```js
  const[config,setConfig]=useState({name:"Dart Turnier",date:"",teamSize:8,finalDoubleOut:true,thirdPlace:true,legsToWin:2});
```

Ersetzen durch:

```js
  const[config,setConfig]=useState({name:"Dart Turnier",date:"",teamSize:8,finalDoubleOut:true,thirdPlace:true,legsToWin:2,startScore:501});
```

Datei `dart-turnier.jsx`, direkt nach dem bestehenden Checkbox-Block
(Zeile 1052-1061, endet mit dem `thirdPlace`-Toggle-Button und dem
schließenden `</div>`), neuen Block für die Spiellänge einfügen:

```js
        <div style={{marginBottom:10}}>
          <span style={{fontSize:10,color:textLow,display:"block",marginBottom:4}}>Spiellänge</span>
          <div role="group" aria-label="Spiellänge" style={{display:"flex",gap:6}}>
            {[301,501].map(v=><button key={v} onClick={()=>setConfig(c=>({...c,startScore:v}))} aria-pressed={config.startScore===v} style={{flex:1,padding:"8px 0",borderRadius:6,background:config.startScore===v?green:surf2,border:`1px solid ${config.startScore===v?green:bdr}`,color:config.startScore===v?bg:textMid,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:F}}>{v}</button>)}
          </div>
        </div>
```

(Einfügen zwischen dem schließenden `</div>` der Checkbox-Reihe, Zeile
1061, und dem darauffolgenden schließenden `</div>` der Card, Zeile
1062 — als zusätzliches Kind derselben Card, vor deren Ende.)

- [ ] **Step 5: Hartkodierte "501"-Textstellen ersetzen**

Datei `dart-turnier.jsx`. Sieben Stellen, jeweils `501` durch die
passende Config-Quelle ersetzen (Setup-Screen und RulesModal haben nur
`config`, Bracket-Ansicht hat `bracket.config`):

Zeile 749 (in `RulesModal`, hat `config` als Prop):

```js
          <div>Jedes Leg startet bei <span style={{color:greenText}}>501</span> Punkten, runtergezählt bis exakt 0.</div>
```
→
```js
          <div>Jedes Leg startet bei <span style={{color:greenText}}>{config.startScore}</span> Punkten, runtergezählt bis exakt 0.</div>
```

Zeilen 1078-1080 (Setup-Vorschau, 8-Team-Zweig):

```js
            <span style={{color:greenText}}>Gruppenphase (2×4 Teams):</span> 501 Single Out · Best of 3<br/>
            <span style={{color:orange}}>Halbfinale:</span> 501 Single Out · Best of 3<br/>
            <span style={{color:colBlue}}>Finale{config.thirdPlace?" & Platz 3":""}:</span> 501{config.finalDoubleOut?" Double Out":" Single Out"} · Best of 5
```
→
```js
            <span style={{color:greenText}}>Gruppenphase (2×4 Teams):</span> {config.startScore} Single Out · Best of 3<br/>
            <span style={{color:orange}}>Halbfinale:</span> {config.startScore} Single Out · Best of 3<br/>
            <span style={{color:colBlue}}>Finale{config.thirdPlace?" & Platz 3":""}:</span> {config.startScore}{config.finalDoubleOut?" Double Out":" Single Out"} · Best of 5
```

Zeilen 1084-1085 (Setup-Vorschau, anderer Teamgrößen-Zweig):

```js
            <span style={{color:greenText}}>Vorrunden:</span> 501 Single Out · Best of {config.legsToWin*2-1}<br/>
            {config.finalDoubleOut&&<><span style={{color:orange}}>Finale:</span> 501 Double Out · Best of {config.legsToWin*2-1}<br/></>}
```
→
```js
            <span style={{color:greenText}}>Vorrunden:</span> {config.startScore} Single Out · Best of {config.legsToWin*2-1}<br/>
            {config.finalDoubleOut&&<><span style={{color:orange}}>Finale:</span> {config.startScore} Double Out · Best of {config.legsToWin*2-1}<br/></>}
```

Zeile 1153 (Bracket-Rundenkopf, hat `bracket.config`):

```js
                <div style={{fontSize:10,color:textLow,marginTop:2}}>501 · {round.isDoubleOut?"Double Out":"Single Out"} · Bo{round.legsToWin*2-1}</div>
```
→
```js
                <div style={{fontSize:10,color:textLow,marginTop:2}}>{bracket.config.startScore} · {round.isDoubleOut?"Double Out":"Single Out"} · Bo{round.legsToWin*2-1}</div>
```

Zeile 1163 (Platz-3-Rundenkopf):

```js
              <div style={{fontSize:10,color:textLow,marginTop:2}}>501 · {thirdRound.isDoubleOut?"Double Out":"Single Out"} · Bo{thirdRound.legsToWin*2-1}</div>
```
→
```js
              <div style={{fontSize:10,color:textLow,marginTop:2}}>{bracket.config.startScore} · {thirdRound.isDoubleOut?"Double Out":"Single Out"} · Bo{thirdRound.legsToWin*2-1}</div>
```

- [ ] **Step 6: Verifizieren**

```bash
npx esbuild dart-turnier.jsx --bundle --loader:.jsx=jsx --external:react --external:react-dom --external:tone --outfile=/dev/null
npm test
```

Erwartet: esbuild ohne Fehler, alle Test-Suiten weiterhin grün (301 ist
reiner Konfigurationswert, ändert keine bestehende Test-Fixture, die
weiterhin `startScore:501` per Default nutzt).

- [ ] **Step 7: Commit**

```bash
git add groups.js dart-turnier.jsx
git commit -m "301-Option zusaetzlich zu 501 (Config-Umschalter im Setup)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Nach Abschluss

Alle drei Tasks reviewt (Spec-Compliance + Code-Qualität) →
`superpowers:finishing-a-development-branch` für
`feature/post-turnier-fixes` (Merge-Optionen), danach Push zu
`master`/GitHub für den nächsten Deploy.
