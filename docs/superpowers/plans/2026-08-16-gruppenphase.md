# Gruppenphase + KO-Playoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zweite Turnier-Format-Option „Gruppenphase + KO-Playoff" neben dem
bestehenden K.-o.-Modus, auf `src/tournament.js`/`round-robin.js`/
`single-elim.js` aufgebaut, additiv (K.-o.-Pfad unverändert).

**Architektur:** Neuer Code-Pfad, ausgewählt über `config.format`
(`"single_elim"` default | `"groups_ko"`). Jedes Match bekommt weiterhin
ein eigenes `match.game` (Engine aus Stage 1) für Live-Scoring; sobald
`match.game.phase==='match_complete'`, wird das Ergebnis per
`reportMatchResult` in den `tournament.js`-State geschrieben (Zwei-Ebenen-
Muster wie in Stage 1: Regeln vs. Turnierstruktur getrennt).

**Tech Stack:** React (dart-turnier.jsx, unverändert Single-File-Prototyp),
`src/tournament.js` + `src/formats/round-robin.js` + `src/formats/single-elim.js`
(bereits getestet, keine Änderungen an `src/` nötig), Playwright für E2E-
Verifikation gegen den `_preview/dist`-Build (kein Unit-Test-Harness für
`dart-turnier.jsx` — entspricht dem bisherigen Stand, siehe CLAUDE.md).

**Abweichung von der Standard-TDD-Schleife dieser Skill:** Kein
`pytest`/Unit-Test pro Schritt — dieses Projekt testet `dart-turnier.jsx`
ausschließlich per Playwright-E2E gegen den gebauten `dist/`, exakt wie
bei Stage 1 (Engine-Konsolidierung) demonstriert und dort erfolgreich
verifiziert. Jeder Task endet stattdessen mit „Build + gezielter
Playwright-Check" statt „Unit-Test".

**Referenz-Spec:** `docs/superpowers/specs/2026-08-16-gruppenphase-design.md`

**Verifizierte API-Verträge** (aus `src/tournament.js`/`formats/*.js`
gelesen, nicht geraten):

```js
createTournament({name,date,participants /* [{id,name}] */, phases:[
  {name:"Gruppenphase",format:"round_robin",groups:N,advanceCount:M},
  {name:"KO-Playoff",format:"single_elim",thirdPlace:bool},
],boards:null})
startPhase(state) // → {state,result}
getReadyMatches(state) // aktuelle Phase, spielbare Matches
getAllMatches(state)   // aktuelle Phase, alle Matches (auch noch nicht spielbar)
getAllGroupTables(state) // [{group,groupName,table}], table=[{id,name,played,won,drawn,lost,points,legsWon,legsLost,legDiff,rank}]
isPhaseComplete(state) // bool
advancePhase(state) // schließt aktuelle Phase ab + startet nächste in einem Call; bei letzter Phase → TOURNAMENT_COMPLETE
reportMatchResult(state,matchId,{winner,score1,score2}) // winner = participant-id
getCurrentPhase(state) // {config,index,status,data}
getStandings(state) // Platzierungen nach letzter abgeschlossener Phase
```

Match-Shape **round_robin**: `{id,group,round,p1,p2,p1Name,p2Name,result,status:'ready'}`
(immer sofort spielbar, Namen schon dabei — kein Lookup nötig).
Match-Shape **single_elim**: `{id,round,position,p1,p2,p1Name,p2Name,result,status:'pending'|'ready'|'complete',isThirdPlace?}`,
Bracket = `{rounds:[[match,...],...], thirdPlaceMatch, roundNames:[...]}`.

---

### Task 1: ScoringView von `teams`+Index auf `t1Name`/`t2Name` umstellen

Vorbereitender Refactor — `ScoringView` liest Team-Namen heute über
`teams[match.t1]`/`teams[match.t2]` (Index-Modell des K.-o.-Pfads). Der
neue Gruppen/KO-Pfad hat keine `teams`-Array, sondern Namen direkt am
Match (`p1Name`/`p2Name`). Statt zwei `ScoringView`-Varianten zu pflegen,
bekommt sie die Namen direkt als Props — beide Pfade können sie dann
gleich nutzen.

**Files:**
- Modify: `dart-turnier.jsx` (ScoringView-Signatur, 2 interne `teams[match.winner]`-Stellen, 2 Call-Sites)

- [ ] **Schritt 1: Signatur + interne Nutzung ändern**

Aktuell (`dart-turnier.jsx`, ScoringView-Start):
```js
function ScoringView({match,teams,roundName,isDoubleOut,onBack,onUpdate,isTV,legsToWin=2,tvControls}){
  ...
  const t1=match.t1!==null?teams[match.t1]:"—";
  const t2=match.t2!==null?teams[match.t2]:"—";
```

Neu:
```js
function ScoringView({match,t1Name,t2Name,roundName,isDoubleOut,onBack,onUpdate,isTV,legsToWin=2,tvControls}){
  ...
  const t1=t1Name??"—";
  const t2=t2Name??"—";
```

- [ ] **Schritt 1b: Die zwei `teams[match.winner]`-Stellen im Sieger-Screen anpassen**

Zwei Stellen in `ScoringView` lesen `teams[match.winner]` direkt statt
über die lokalen `t1`/`t2`-Variablen — beide auf lokale Auflösung
umstellen (`match.winner` ist der Team-Index, Vergleich mit `match.t1`
sagt, ob Team 1 gewonnen hat):

TV-Sieger-Overlay:
```js
// vorher:
<div style={{fontFamily:FD,fontSize:"min(120px,11vw)",fontWeight:800,color:textHi,lineHeight:0.92,letterSpacing:"-0.02em",textAlign:"center",padding:"0 6vw"}}>{teams[match.winner]}</div>
// neu:
<div style={{fontFamily:FD,fontSize:"min(120px,11vw)",fontWeight:800,color:textHi,lineHeight:0.92,letterSpacing:"-0.02em",textAlign:"center",padding:"0 6vw"}}>{match.winner===match.t1?t1:t2}</div>
```

Mobiler Sieger-Screen:
```js
// vorher:
<div style={{fontFamily:FD,fontSize:22,fontWeight:800,color:green,letterSpacing:"-0.01em"}}>{teams[match.winner]} gewinnt!</div>
// neu:
<div style={{fontFamily:FD,fontSize:22,fontWeight:800,color:green,letterSpacing:"-0.01em"}}>{match.winner===match.t1?t1:t2} gewinnt!</div>
```

- [ ] **Schritt 2: Beide bestehenden Call-Sites anpassen**

`TvAuto` (Live-Match-Zweig):
```js
// vorher: <ScoringView match={focus.match} teams={bracket.teams} ...
<ScoringView match={focus.match} t1Name={bracket.teams[focus.match.t1]} t2Name={bracket.teams[focus.match.t2]} roundName={focus.round.name} isDoubleOut={focus.round.isDoubleOut} onBack={()=>{}} onUpdate={()=>{}} isTV={true} legsToWin={bracket.config.legsToWin} tvControls={buttons}/>
```

Haupt-App (Scoring/TV-Zweig):
```js
// vorher: <ScoringView match={result.match} teams={bracket.teams} ...
<ScoringView match={result.match} t1Name={bracket.teams[result.match.t1]} t2Name={bracket.teams[result.match.t2]} roundName={result.round.name} isDoubleOut={result.round.isDoubleOut} onBack={back} onUpdate={handleUpdate} isTV={phase==="tv"} legsToWin={bracket.config.legsToWin}/>
```

- [ ] **Schritt 3: Build + Regressionscheck**

```bash
cd _preview && npm run build
```
Erwartet: baut fehlerfrei. Dann bestehendes Playwright-Smoke-Skript aus
Stage 1 (`/tmp/.../scratchpad/pw/smoke.mjs` bzw. neu am gleichen Ort
angelegt, siehe Task 8) laufen lassen — muss weiterhin komplett grün
sein (K.-o.-Pfad unverändert im Verhalten).

- [ ] **Schritt 4: Commit**

```bash
git add dart-turnier.jsx
git commit -m "Refactor: ScoringView nimmt t1Name/t2Name statt teams+Index

Vorbereitung für den Gruppenphase-Pfad, der kein teams-Array hat.
K.-o.-Verhalten unverändert (beide Call-Sites lösen den Namen weiter
über bracket.teams[match.t1/t2] auf, nur einmalig statt inline in
ScoringView selbst)."
```

---

### Task 2: Setup-UI — Format-Wahl + Gruppen-Konfiguration

**Files:**
- Modify: `dart-turnier.jsx` (config-State ~Zeile 717, Setup-JSX ~Zeile 819-846)

- [ ] **Schritt 1: Config-State erweitern**

```js
const[config,setConfig]=useState({
  name:"Dart Turnier",date:"",teamSize:8,
  format:"single_elim", // "single_elim" | "groups_ko"
  finalDoubleOut:true,thirdPlace:true,legsToWin:2, // K.-o.-Regeln (unverändert)
  numGroups:2,advanceCount:2,
  groupLegsToWin:2,groupDoubleOut:false, // Gruppenphase-Regeln
  koLegsToWin:2,koDoubleOut:true,koThirdPlace:true, // KO-Playoff-Regeln
});
```

- [ ] **Schritt 2: Wiederverwendbaren Stepper einführen**

Vor `function DartTurnier(){`:
```js
function Stepper({label,value,onChange,min,max}){
  return<div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
    <span style={{fontSize:12,color:textLow,flex:1}}>{label}</span>
    <button onClick={()=>onChange(Math.max(min,value-1))} disabled={value<=min} aria-label={`${label} verringern`} style={{width:36,padding:"6px 0",borderRadius:6,background:surf2,border:`1px solid ${bdr}`,color:textHi,fontSize:16,fontWeight:700,fontFamily:F}}>−</button>
    <span className="score-num" style={{minWidth:20,textAlign:"center",fontSize:15,fontWeight:800}}>{value}</span>
    <button onClick={()=>onChange(Math.min(max,value+1))} disabled={value>=max} aria-label={`${label} erhöhen`} style={{width:36,padding:"6px 0",borderRadius:6,background:surf2,border:`1px solid ${bdr}`,color:textHi,fontSize:16,fontWeight:700,fontFamily:F}}>+</button>
  </div>;
}
function DoubleOutToggle({checked,onChange,label}){
  return<button onClick={onChange} aria-pressed={checked} style={{fontSize:11,color:textLow,display:"flex",alignItems:"center",gap:4,cursor:"pointer",background:"none",border:"none",padding:0,marginBottom:8}}>
    <span aria-hidden="true" style={{width:16,height:16,borderRadius:4,border:`1px solid ${bdr}`,background:checked?green:surf2,display:"inline-block",textAlign:"center",lineHeight:"16px",fontSize:10,color:bg}}>{checked?"✓":""}</span>
    {label}
  </button>;
}
```

- [ ] **Schritt 3: Format-Toggle + bedingte Konfig-Blöcke im Setup-JSX**

Direkt nach dem Teamanzahl-`role="group"`-Block (vor dem bestehenden
`finalDoubleOut`/`thirdPlace`-`<div>`), einfügen:
```jsx
<div style={{display:"flex",gap:8,marginBottom:14}}>
  {[["single_elim","K.-o."],["groups_ko","Gruppen + Playoff"]].map(([f,l])=>
    <button key={f} onClick={()=>setConfig(c=>({...c,format:f}))} aria-pressed={config.format===f} style={{flex:1,padding:"10px 0",borderRadius:8,background:config.format===f?greenDark:surf2,border:`1px solid ${config.format===f?greenBdr:bdr}`,color:config.format===f?greenText:textLow,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:F}}>{l}</button>
  )}
</div>
```

Bestehenden `finalDoubleOut`/`thirdPlace`-Block in `{config.format==="single_elim"&&<>...</>}`
wrappen (Inhalt unverändert). Direkt danach neuer Block:
```jsx
{config.format==="groups_ko"&&<>
  <Stepper label="Gruppen" value={config.numGroups} onChange={v=>setConfig(c=>({...c,numGroups:v}))} min={1} max={4}/>
  <Stepper label="Kommt weiter (pro Gruppe)" value={config.advanceCount} onChange={v=>setConfig(c=>({...c,advanceCount:v}))} min={1} max={4}/>
  <div style={{fontSize:10,color:textLow,fontWeight:600,margin:"12px 0 6px",letterSpacing:"0.06em"}}>GRUPPENPHASE</div>
  <Stepper label="Best of (Legs)" value={config.groupLegsToWin*2-1} onChange={v=>setConfig(c=>({...c,groupLegsToWin:Math.ceil((v+1)/2)}))} min={1} max={9}/>
  <DoubleOutToggle checked={config.groupDoubleOut} onChange={()=>setConfig(c=>({...c,groupDoubleOut:!c.groupDoubleOut}))} label="Double Out"/>
  <div style={{fontSize:10,color:textLow,fontWeight:600,margin:"12px 0 6px",letterSpacing:"0.06em"}}>KO-PLAYOFF</div>
  <Stepper label="Best of (Legs)" value={config.koLegsToWin*2-1} onChange={v=>setConfig(c=>({...c,koLegsToWin:Math.ceil((v+1)/2)}))} min={1} max={9}/>
  <DoubleOutToggle checked={config.koDoubleOut} onChange={()=>setConfig(c=>({...c,koDoubleOut:!c.koDoubleOut}))} label="Double Out"/>
  <DoubleOutToggle checked={config.koThirdPlace} onChange={()=>setConfig(c=>({...c,koThirdPlace:!c.koThirdPlace}))} label="Spiel um Platz 3"/>
</>}
```
(Stepper zeigt/setzt Best-of-N direkt statt der internen `legsToWin`,
damit die Anzeige mit dem heutigen „Bo{legsToWin*2-1}"-Text konsistent
bleibt — `Math.ceil((v+1)/2)` rechnet von Bo-N zurück auf `legsToWin`.)

- [ ] **Schritt 4: Build + Sichtcheck**

```bash
cd _preview && npm run build
```
Playwright: Setup-Screen öffnen, „Gruppen + Playoff" klicken, prüfen
dass die neuen Stepper/Toggles erscheinen; „K.-o." zurückklicken, prüfen
dass der alte Block wieder da ist und `Turnier starten` weiterhin den
bestehenden K.-o.-Flow auslöst (noch unverändert, da `startTournament`
in diesem Task noch nicht angefasst wird).

- [ ] **Schritt 5: Commit**

```bash
git add dart-turnier.jsx
git commit -m "Setup-UI: Format-Wahl (K.-o. / Gruppen+Playoff) + Gruppen-Konfiguration

Noch ohne Funktion — startTournament() verzweigt erst in Task 3.
K.-o.-Pfad unverändert."
```

---

### Task 3: Gruppenphase — Turnier-Erzeugung, Standings, Match-Liste

**Files:**
- Modify: `dart-turnier.jsx` (Imports, `startTournament`, neue Komponenten `GroupOverview`+`GroupMatchCard`, neuer `phase==="groups"`-Render-Zweig, neuer State `tournament`)

- [ ] **Schritt 1: Imports ergänzen**

Nach den bestehenden `src/engine.js`/`checkouts.js`/`types.js`-Imports:
```js
import { createTournament, startPhase, reportMatchResult, advancePhase,
  getReadyMatches as getTournamentReady, getAllMatches as getTournamentMatches,
  getAllGroupTables, isPhaseComplete, getCurrentPhase, getStandings } from "./src/tournament.js";
```

- [ ] **Schritt 2: Turnier-Erzeugung-Helper + State**

Bei den anderen Top-Level-Helpern (nach `buildBracket`/`propagateBracket`):
```js
function buildGroupTournament(teamNames,config){
  const names=shuffle(teamNames.map((n,i)=>n.trim()||`Team ${i+1}`));
  const participants=names.map((name,i)=>({id:String(i),name}));
  const created=createTournament({
    name:config.name,date:config.date,participants,
    phases:[
      {name:"Gruppenphase",format:"round_robin",groups:config.numGroups,advanceCount:config.advanceCount},
      {name:"KO-Playoff",format:"single_elim",thirdPlace:config.koThirdPlace},
    ],
    boards:null,
  });
  return startPhase(created).state;
}
```

In `DartTurnier`, neuer State neben `bracket`:
```js
const[tournament,setTournament]=useState(null);
```

- [ ] **Schritt 3: `startTournament` verzweigen**

```js
const startTournament=()=>{
  if(config.format==="groups_ko"){
    setTournament(buildGroupTournament(teamNames,config));
    setPhase("groups");
    return;
  }
  const names=shuffle(teamNames.map((n,i)=>n.trim()||`Team ${i+1}`));
  const b=buildBracket(names,config);
  propagateBracket(b);
  setBracket(b);setPhase("bracket");
};
```

- [ ] **Schritt 4: `GroupOverview`-Komponente**

Neue Komponente (bei `StatsView`/`TvOverview` einsortieren):
Pro Tabellenzeile ein `<div style={{display:"contents"}}>` mit `key`
statt `React.Fragment` (kein neuer `React`-Import nötig — `display:"contents"`
lässt die Kind-Divs direkt im Grid des Elternteils landen, kein
zusätzliches Grid-Item):
```js
function GroupOverview({tournament}){
  const tables=getAllGroupTables(tournament);
  if(!tables)return null;
  return<div style={{display:"flex",flexDirection:"column",gap:14}}>
    {tables.map(({group,groupName,table})=>(
      <div key={group} style={{background:card,border:`1px solid ${bdr}`,borderRadius:10,padding:"12px 14px"}}>
        <div style={{fontSize:13,fontWeight:700,color:textHi,marginBottom:8,fontFamily:F}}>{groupName}</div>
        <div style={{display:"grid",gridTemplateColumns:"20px 1fr 30px 30px 30px",gap:"4px 8px",fontSize:11}}>
          <div style={{color:textOff}}>#</div><div style={{color:textOff}}>Team</div><div style={{color:textOff,textAlign:"right"}}>S-N</div><div style={{color:textOff,textAlign:"right"}}>Legs</div><div style={{color:textOff,textAlign:"right"}}>Pkt</div>
          {table.map(row=><div key={row.id} style={{display:"contents"}}>
            <div style={{color:textLow}}>{row.rank}</div>
            <div style={{color:textHi,fontWeight:600}}>{row.name}</div>
            <div style={{color:textLow,textAlign:"right"}}>{row.won}-{row.lost}</div>
            <div style={{color:textLow,textAlign:"right"}}>{row.legDiff>0?"+":""}{row.legDiff}</div>
            <div style={{color:greenText,fontWeight:700,textAlign:"right"}}>{row.points}</div>
          </div>)}
        </div>
      </div>
    ))}
  </div>;
}
```

- [ ] **Schritt 5: `GroupMatchCard`-Komponente**

Analog zu `MatchCard`, aber auf dem `p1Name`/`p2Name`/`result`-Modell:
```js
function GroupMatchCard({match,onOpen}){
  const done=match.result!==null;
  const ready=match.p1!==null&&match.p2!==null;
  return<button onClick={()=>ready&&!done&&onOpen(match.id)} disabled={!ready||done} style={{width:"100%",textAlign:"left",background:done?greenDark:card,border:`1px solid ${done?greenBdr:bdr}`,borderRadius:10,padding:"10px 14px",color:"inherit"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}><span style={{color:match.result?.winner===match.p1?green:textMid,fontSize:13,fontWeight:match.result?.winner===match.p1?700:400,fontFamily:F}}>{match.p1Name}</span><span style={{color:textLow,fontSize:14,fontFamily:F,fontWeight:700}}>{match.result?.score1??""}</span></div>
    <div style={{height:1,background:bdr}}/>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:5}}><span style={{color:match.result?.winner===match.p2?green:textMid,fontSize:13,fontWeight:match.result?.winner===match.p2?700:400,fontFamily:F}}>{match.p2Name}</span><span style={{color:textLow,fontSize:14,fontFamily:F,fontWeight:700}}>{match.result?.score2??""}</span></div>
    {ready&&!done&&<div style={{textAlign:"center",marginTop:6,fontSize:10,color:green}}>▶ Spielen</div>}
  </button>;
}
```

- [ ] **Schritt 6: Render-Zweig `phase==="groups"`**

In `DartTurnier`, vor dem bestehenden `// ── BRACKET ──`-Zweig:
```jsx
if(phase==="groups"&&tournament){
  const matches=getTournamentMatches(tournament);
  const byGroup={};
  matches.forEach(m=>{(byGroup[m.group]??=[]).push(m);});
  return(
    <div style={{minHeight:"100vh",background:bg,color:textHi,fontFamily:F,padding:"16px 12px"}}>
      <GlobalStyles/>
      <h2 style={{fontFamily:FD,fontSize:18,fontWeight:800,margin:"0 0 14px"}}>{tournament.config.name} — Gruppenphase</h2>
      <GroupOverview tournament={tournament}/>
      <div style={{marginTop:16,display:"flex",flexDirection:"column",gap:10}}>
        {Object.entries(byGroup).map(([g,ms])=>(
          <div key={g}>
            <div style={{fontSize:11,color:textLow,marginBottom:6}}>Gruppe {String.fromCharCode(65+Number(g))} — Spiele</div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {ms.map(m=><GroupMatchCard key={m.id} match={m} onOpen={id=>{setActiveMatchId(id);setPhase("group-scoring");}}/>)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Schritt 7: Build + Playwright-Check**

```bash
cd _preview && npm run build
```
Playwright: Setup → „Gruppen + Playoff" → 2 Gruppen/Advance 2 (Default)
→ „Turnier starten" → Seite zeigt „Gruppenphase" mit 2 Gruppentabellen
und je 1 Block „Spiele" mit `▶ Spielen`-Karten (bei 8 Teams: 2 Gruppen
à 4 = je 6 Spiele). `localStorage`/App-State noch nicht persistiert
(folgt Task 7) — für diesen Check reicht `page.evaluate` gegen den
React-State nicht, stattdessen: Sichttext prüfen (`Gruppe A`, `Gruppe B`,
`▶ Spielen` mind. 12x vorhanden).

- [ ] **Schritt 8: Commit**

```bash
git add dart-turnier.jsx
git commit -m "Gruppenphase: Turnier-Erzeugung + Standings + Match-Liste

buildGroupTournament() auf tournament.js/round-robin.js. Matches noch
nicht spielbar (Scoring folgt in Task 4) — Kartenliste + Tabellen
rendern bereits korrekt."
```

---

### Task 4: Gruppenphase — Match-Scoring

**Files:**
- Modify: `dart-turnier.jsx` (`match.game`-Lazy-Init, neuer `phase==="group-scoring"`-Zweig, `handleGroupUpdate`)

- [ ] **Schritt 1: Lazy-`match.game`-Helper**

Bei den anderen Top-Level-Helpern. `ScoringView` erwartet `match.t1`/
`match.t2` (Sieger-Vergleichswert, muss nur eindeutig sein, keine Zahl
nötig — `p1`/`p2` sind Strings und funktionieren identisch) sowie
`match.winner`/`match.started`, die `tournament.js`-Matches nicht haben
(dort heißt „gewonnen" `result!==null`) — `ensureGame` gleicht das an,
damit `ScoringView` unverändert (inkl. der in Task 1 gefixten
Sieger-Zeilen) für diesen Pfad funktioniert:
```js
// Erzeugt beim ersten Öffnen ein Engine-Spiel für ein tournament.js-Match — dort haben
// Matches (anders als im K.-o.-Modell) nicht von Anfang an feststehende Gegner, .game wird
// daher erst gebraucht, sobald ein Match tatsächlich gespielt wird. t1/t2/winner/started
// werden auf p1/p2/null/false aliasiert, damit ScoringView unverändert funktioniert.
function ensureGame(match,rules){
  const aligned={...match,t1:match.t1??match.p1,t2:match.t2??match.p2,winner:match.winner??null,started:match.started??false};
  if(aligned.game)return aligned;
  return{...aligned,game:createGame({startScore:501,checkoutMode:rules.doubleOut?"double":"single",legsToWin:rules.legsToWin,dartsPerTurn:3})};
}
function findTournamentMatch(tournament,id){
  return getTournamentMatches(tournament).find(m=>m.id===id)||null;
}
```

- [ ] **Schritt 2: Update-Handler — schreibt `match.game` weiter, meldet Ergebnis bei Match-Ende**

```js
const handleGroupUpdate=(updatedMatch)=>{
  if(updatedMatch.game.phase!=="match_complete"){
    // Nur der Live-Spielstand ändert sich — .game liegt lokal am Match-Objekt, tournament.js
    // kennt das Match erst nach reportMatchResult. Zwischenstand hängen wir einfach am
    // gefundenen Match im aktuellen tournament-State ein (kein eigener Store nötig).
    setTournament(prev=>{
      const t=structuredClone(prev);
      const m=findTournamentMatch(t,updatedMatch.id);
      Object.assign(m,updatedMatch);
      return t;
    });
    return;
  }
  const winnerId=updatedMatch.game.winner===0?updatedMatch.p1:updatedMatch.p2;
  const res=reportMatchResult(tournament,updatedMatch.id,{winner:winnerId,score1:updatedMatch.game.legs[0],score2:updatedMatch.game.legs[1]});
  setTournament(res.state);
  setActiveMatchId(null);setPhase("groups");
};
```

- [ ] **Schritt 3: Render-Zweig `phase==="group-scoring"`**

Vor dem `phase==="groups"`-Zweig aus Task 3:
```jsx
if(phase==="group-scoring"&&tournament&&activeMatchId){
  const raw=findTournamentMatch(tournament,activeMatchId);
  if(!raw)return null;
  const match=ensureGame(raw,{doubleOut:config.groupDoubleOut,legsToWin:config.groupLegsToWin});
  return<><GlobalStyles/><ScoringView match={match} t1Name={match.p1Name} t2Name={match.p2Name} roundName="Gruppenphase" isDoubleOut={config.groupDoubleOut} onBack={()=>{setActiveMatchId(null);setPhase("groups");}} onUpdate={handleGroupUpdate} isTV={false} legsToWin={config.groupLegsToWin}/></>;
}
```
`ScoringView`s eigene `applyThrowResult` (aus Stage 1, unverändert) setzt
bei Match-Ende `m.winner=m.game.winner===0?m.t1:m.t2` — dank `ensureGame`s
`t1:match.p1,t2:match.p2`-Aliasing landet dort die `p1`/`p2`-ID, und die
in Task 1 gefixten Sieger-Zeilen (`match.winner===match.t1?t1:t2`)
lösen sie korrekt zum Namen auf. Kein weiterer Eingriff in `ScoringView`
nötig — funktioniert identisch für K.-o.- und Gruppen-Matches.

- [ ] **Schritt 4: Build + Playwright-Check**

```bash
cd _preview && npm run build
```
Playwright: Gruppenphase-Screen → erste `▶ Spielen`-Karte öffnen →
„Wer beginnt?" → ein Match komplett durchspielen (gleiches
`enterTotal`-Muster wie in Stage 1s Smoke-Test) → zurück auf
Gruppen-Screen → prüfen, dass die Tabelle aktualisiert ist (Sieger-Team
hat jetzt `won:1`/`points:3` in der jeweiligen Gruppentabelle) und die
Match-Karte als abgeschlossen (grün, Ergebnis statt „▶ Spielen") zeigt.

- [ ] **Schritt 5: Commit**

```bash
git add dart-turnier.jsx
git commit -m "Gruppenphase: Match-Scoring verdrahtet

ensureGame() erzeugt match.game lazy beim ersten Öffnen. Nach
MATCH_COMPLETE wird das Ergebnis per reportMatchResult in den
tournament.js-State geschrieben, Tabelle aktualisiert sich."
```

---

### Task 5: Phasenübergang + KO-Playoff-Bracket-UI

**Files:**
- Modify: `dart-turnier.jsx` (Phasenübergang-Button, neue `KoOverview`-Komponente, `phase==="groups"`-Zweig erweitert)

- [ ] **Schritt 1: `KoOverview`-Komponente**

Analog zum bestehenden Bracket-Rendering (Zeilen ~903-925 der Datei),
aber auf `phase.data.bracket`s Shape (`rounds`/`roundNames`/`thirdPlaceMatch`,
`p1Name`/`p2Name` direkt am Match statt Index-Lookup):
```js
function KoOverview({tournament,onOpen}){
  const phase=getCurrentPhase(tournament);
  const bracket=phase.data.bracket;
  return<div style={{overflowX:"auto"}}>
    <div style={{display:"flex",gap:14,minWidth:"fit-content",alignItems:"flex-start"}}>
      {bracket.rounds.map((round,rIdx)=>(
        <div key={rIdx} style={{display:"flex",flexDirection:"column",gap:10,minWidth:190}}>
          <div style={{textAlign:"center",paddingBottom:4,borderBottom:`1px solid ${bdrSoft}`,fontSize:12,fontWeight:700,color:textHi}}>{bracket.roundNames[rIdx]}</div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {round.map(m=><GroupMatchCard key={m.id} match={m} onOpen={onOpen}/>)}
          </div>
        </div>
      ))}
      {bracket.thirdPlaceMatch&&<div style={{display:"flex",flexDirection:"column",gap:10,minWidth:190}}>
        <div style={{textAlign:"center",paddingBottom:4,borderBottom:`1px solid ${bdrSoft}`,fontSize:12,fontWeight:700,color:colBlue}}>Platz 3</div>
        <GroupMatchCard match={bracket.thirdPlaceMatch} onOpen={onOpen}/>
      </div>}
    </div>
  </div>;
}
```
(`GroupMatchCard` aus Task 3 wird direkt wiederverwendet — Match-Shape
ist bei `round_robin` und `single_elim` identisch genug, `result.score1/2`
plus `p1Name`/`p2Name`/`p1`/`p2`. Kein neuer Kartentyp nötig.)

- [ ] **Schritt 2: Phasenübergang im `phase==="groups"`-Zweig**

`GroupOverview`-Aufruf in Task 3s Render-Zweig ersetzen durch
phasenbewusste Logik: sobald `isPhaseComplete(tournament)` (Gruppenphase
fertig) UND `getCurrentPhase(tournament).config.format==="round_robin"`,
Button zeigen; danach automatisch `KoOverview` statt `GroupOverview`
rendern (Phase hat sich durch `advancePhase` intern schon gewechselt):
```jsx
if(phase==="groups"&&tournament){
  const curPhase=getCurrentPhase(tournament);
  const groupDone=curPhase.config.format==="round_robin"&&isPhaseComplete(tournament);
  return(
    <div style={{minHeight:"100vh",background:bg,color:textHi,fontFamily:F,padding:"16px 12px"}}>
      <GlobalStyles/>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <h2 style={{fontFamily:FD,fontSize:18,fontWeight:800,margin:0}}>{tournament.config.name} — {curPhase.config.name}</h2>
        {groupDone&&<button onClick={()=>setTournament(advancePhase(tournament).state)} style={{padding:"10px 18px",background:green,color:bg,border:"none",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:F}}>Zur KO-Phase →</button>}
      </div>
      {curPhase.config.format==="round_robin"?<>
        <GroupOverview tournament={tournament}/>
        <div style={{marginTop:16,display:"flex",flexDirection:"column",gap:10}}>
          {Object.entries(getTournamentMatches(tournament).reduce((acc,m)=>{(acc[m.group]??=[]).push(m);return acc;},{})).map(([g,ms])=>(
            <div key={g}>
              <div style={{fontSize:11,color:textLow,marginBottom:6}}>Gruppe {String.fromCharCode(65+Number(g))} — Spiele</div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {ms.map(m=><GroupMatchCard key={m.id} match={m} onOpen={id=>{setActiveMatchId(id);setPhase("group-scoring");}}/>)}
              </div>
            </div>
          ))}
        </div>
      </>:<KoOverview tournament={tournament} onOpen={id=>{setActiveMatchId(id);setPhase("group-scoring");}}/>}
    </div>
  );
}
```
Der `phase==="group-scoring"`-Zweig aus Task 4 bedient jetzt beide
Unterphasen — `ensureGame`/`handleGroupUpdate` kennen kein Phasen-Konzept,
arbeiten nur mit `tournament`-State + Match-ID, egal ob Gruppen- oder
KO-Match. Nur die Regeln (Double-Out/Legs) unterscheiden sich je Phase.
Task 4s Fassung komplett ersetzen durch:
```jsx
if(phase==="group-scoring"&&tournament&&activeMatchId){
  const raw=findTournamentMatch(tournament,activeMatchId);
  if(!raw)return null;
  const curPhaseFormat=getCurrentPhase(tournament).config.format;
  const rules=curPhaseFormat==="single_elim"
    ?{doubleOut:config.koDoubleOut,legsToWin:config.koLegsToWin}
    :{doubleOut:config.groupDoubleOut,legsToWin:config.groupLegsToWin};
  const match=ensureGame(raw,rules);
  return<><GlobalStyles/><ScoringView match={match} t1Name={match.p1Name} t2Name={match.p2Name} roundName={curPhaseFormat==="single_elim"?"KO-Playoff":"Gruppenphase"} isDoubleOut={rules.doubleOut} onBack={()=>{setActiveMatchId(null);setPhase("groups");}} onUpdate={handleGroupUpdate} isTV={false} legsToWin={rules.legsToWin}/></>;
}
```

- [ ] **Schritt 3: Build + Playwright-Check**

```bash
cd _preview && npm run build
```
Playwright: alle Gruppenspiele deterministisch durchspielen (Sequenz wie
in Task 4, wiederholt für alle 12 Matches bei 2×4-Gruppen — gleiche
`enterTotal`-Helper-Funktion wiederverwenden) → „Zur KO-Phase"-Button
erscheint, klicken → `KoOverview` zeigt die vier advancierten Teams im
Halbfinale.

- [ ] **Schritt 4: Commit**

```bash
git add dart-turnier.jsx
git commit -m "Phasenübergang Gruppenphase → KO-Playoff + KO-Bracket-UI

advancePhase() baut den KO-Bracket aus den Top-N pro Gruppe. Scoring-
Zweig aus Task 4 bedient jetzt beide Phasen (eigene Regeln je Phase)."
```

---

### Task 6: KO-Playoff-Abschluss — Turniersieger

**Files:**
- Modify: `dart-turnier.jsx` (`handleGroupUpdate` erweitert um Turnierende, Sieger-Anzeige im `phase==="groups"`-Zweig)

- [ ] **Schritt 1: Turnierende in `handleGroupUpdate` erkennen**

`handleGroupUpdate` aus Task 4 komplett ersetzen (Live-Update-Zweig
unverändert, nur der Match-Ende-Zweig bekommt den Kommentar zur
Turnierende-Semantik — die eigentliche Sieger-Erkennung passiert in
Schritt 2 über `tournament.status`, hier ändert sich nur der Kommentar):
```js
const handleGroupUpdate=(updatedMatch)=>{
  if(updatedMatch.game.phase!=="match_complete"){
    setTournament(prev=>{
      const t=structuredClone(prev);
      const m=findTournamentMatch(t,updatedMatch.id);
      Object.assign(m,updatedMatch);
      return t;
    });
    return;
  }
  const winnerId=updatedMatch.game.winner===0?updatedMatch.p1:updatedMatch.p2;
  const res=reportMatchResult(tournament,updatedMatch.id,{winner:winnerId,score1:updatedMatch.game.legs[0],score2:updatedMatch.game.legs[1]});
  // Turnier endet nicht automatisch mit dem letzten Match — isPhaseComplete steuert weiter
  // den Button in Schritt 2, der explizit advancePhase() aufruft (liefert bei der letzten
  // Phase TOURNAMENT_COMPLETE statt eine dritte Phase zu starten).
  setTournament(res.state);
  setActiveMatchId(null);setPhase("groups");
};
```

- [ ] **Schritt 2: `phase==="groups"`-Zweig aus Task 5 komplett ersetzen**

Button muss je nach Phase „Zur KO-Phase" (mehr Phasen offen) oder
„Turnier abschließen" (letzte Phase fertig) heißen, plus Sieger-Box nach
Turnierende. Task 5s Fassung vollständig ersetzen durch:
```jsx
if(phase==="groups"&&tournament){
  const curPhase=getCurrentPhase(tournament);
  const phaseDone=isPhaseComplete(tournament);
  const isLastPhase=curPhase.index===tournament.phases.length-1;
  const champion=tournament.status==="complete"&&getStandings(tournament)?.[0]
    ?tournament.config.participants.find(p=>p.id===getStandings(tournament)[0].id)?.name
    :null;
  return(
    <div style={{minHeight:"100vh",background:bg,color:textHi,fontFamily:F,padding:"16px 12px"}}>
      <GlobalStyles/>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <h2 style={{fontFamily:FD,fontSize:18,fontWeight:800,margin:0}}>{tournament.config.name} — {curPhase.config.name}</h2>
        {phaseDone&&tournament.status!=="complete"&&<button onClick={()=>setTournament(advancePhase(tournament).state)} style={{padding:"10px 18px",background:green,color:bg,border:"none",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:F}}>{isLastPhase?"Turnier abschließen":"Zur KO-Phase →"}</button>}
      </div>
      {champion&&<div style={{padding:"20px 16px",background:greenDark,border:`1px solid ${greenBdr}`,borderRadius:12,textAlign:"center",marginBottom:14}}>
        <div style={{fontSize:32}}>🏆</div>
        <div className="label-upper" style={{fontSize:10,color:greenText,marginTop:6}}>TURNIERSIEGER</div>
        <div style={{fontFamily:FD,fontSize:22,fontWeight:800,color:textHi,marginTop:6}}>{champion}</div>
      </div>}
      {curPhase.config.format==="round_robin"?<>
        <GroupOverview tournament={tournament}/>
        <div style={{marginTop:16,display:"flex",flexDirection:"column",gap:10}}>
          {Object.entries(getTournamentMatches(tournament).reduce((acc,m)=>{(acc[m.group]??=[]).push(m);return acc;},{})).map(([g,ms])=>(
            <div key={g}>
              <div style={{fontSize:11,color:textLow,marginBottom:6}}>Gruppe {String.fromCharCode(65+Number(g))} — Spiele</div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {ms.map(m=><GroupMatchCard key={m.id} match={m} onOpen={id=>{setActiveMatchId(id);setPhase("group-scoring");}}/>)}
              </div>
            </div>
          ))}
        </div>
      </>:<KoOverview tournament={tournament} onOpen={id=>{setActiveMatchId(id);setPhase("group-scoring");}}/>}
    </div>
  );
}
```

- [ ] **Schritt 3: Build + Playwright-Check**

```bash
cd _preview && npm run build
```
Playwright: KO-Playoff (Halbfinale + Finale + ggf. Platz-3) deterministisch
zu Ende spielen, „Turnier abschließen" klicken, Sieger-Box mit korrektem
Teamnamen prüfen.

- [ ] **Schritt 4: Commit**

```bash
git add dart-turnier.jsx
git commit -m "KO-Playoff-Abschluss: Turniersieger-Anzeige

tournament.status==='complete' nach finalem advancePhase() zeigt den
Sieger — gleiche Optik wie die bestehende K.-o.-Sieger-Box."
```

---

### Task 7: TV-Ansicht für Gruppenphase

**Files:**
- Modify: `dart-turnier.jsx` (neue `GroupTv`-Komponente, `TvAuto`/`openTvOverview`-Routing erweitert um `tournament`)

- [ ] **Schritt 1: `GroupTv`-Komponente**

Großformat-Variante von `GroupOverview` für den TV-Screen (gleiche
Optik-Sprache wie `TvOverview`):
```js
function GroupTv({tournament}){
  const curPhase=getCurrentPhase(tournament);
  if(curPhase.config.format!=="round_robin")return null;
  const tables=getAllGroupTables(tournament);
  return<div style={{minHeight:"100vh",background:bg,color:textHi,fontFamily:F,padding:"24px 32px"}}>
    <GlobalStyles/>
    <h2 style={{fontFamily:FD,fontSize:28,fontWeight:800,margin:"0 0 20px"}}>{tournament.config.name} — Gruppenphase</h2>
    <div style={{display:"flex",gap:24,flexWrap:"wrap"}}>
      {tables.map(({group,groupName,table})=>(
        <div key={group} style={{background:card,border:`1px solid ${bdr}`,borderRadius:12,padding:"16px 20px",minWidth:280}}>
          <div style={{fontSize:18,fontWeight:700,marginBottom:10}}>{groupName}</div>
          {table.map(row=><div key={row.id} style={{display:"flex",justifyContent:"space-between",fontSize:14,padding:"4px 0",color:row.rank<=2?textHi:textLow}}>
            <span>{row.rank}. {row.name}</span><span className="score-num">{row.points} Pkt</span>
          </div>)}
        </div>
      ))}
    </div>
  </div>;
}
```

- [ ] **Schritt 2: `TvAuto` um Tournament-Modus erweitern**

`TvAuto` bekommt einen zusätzlichen `tournament`-Prop; wenn gesetzt und
aktuelle Phase `round_robin` ist, `GroupTv` statt `TvOverview` rendern
(Live-Match-Erkennung/`ScoringView`-Zweig bleibt wie gehabt, arbeitet
bereits mit `t1Name`/`t2Name` seit Task 1 — für ein Gruppen-Match müssten
`t1Name`/`t2Name` aus `focus.match.p1Name`/`p2Name` statt
`bracket.teams[...]` kommen, siehe Schritt 3):
```js
function TvAuto({bracket,tournament,theme,toggleTheme}){
  ...
  if(tournament){
    const curPhase=getCurrentPhase(tournament);
    if(curPhase.config.format==="round_robin")return<>{controls-wie-gehabt}<GroupTv tournament={tournament}/></>;
    // KO-Phase: gleiche KoOverview-Optik wie im Setup-Screen, kein separates TV-Rendering nötig
    // für diese Iteration (Zuschauer nutzen die reguläre Bracket-Ansicht am Laptop) — YAGNI,
    // TV für die KO-Phase des Gruppenmodus bleibt Folge-Iteration.
  }
  ...bestehende bracket-Logik unverändert...
}
```
(Bewusste Scope-Grenze: TV für die KO-Phase des Gruppenmodus wird NICHT
in dieser Iteration gebaut — nur die Gruppenphase-Tabelle. Grund: KO
sieht optisch fast identisch zum bestehenden K.-o.-TV aus, aber die
Datenmodelle unterscheiden sich (`p1Name` vs. Index) genug, dass eine
saubere Wiederverwendung einen weiteren Adapter bräuchte. Für die
Zuschauer reicht am Turniertag die Gruppenphase-Tabelle auf dem TV, die
KO-Phase kann vom Laptop aus verfolgt werden — auf der Roadmap für eine
Folge-Iteration vermerkt.)

- [ ] **Schritt 3: `openTvOverview`/Render-Aufrufer um `tournament` ergänzen**

`phase==="tv-overview"`-Zweig in `DartTurnier`:
```js
if(phase==="tv-overview"&&(bracket||tournament))return<TvAuto bracket={bracket} tournament={tournament} theme={theme} toggleTheme={toggleTheme}/>;
```

- [ ] **Schritt 4: Build + Playwright-Check**

```bash
cd _preview && npm run build
```
Playwright: Gruppenturnier starten, zweite Seite mit `?tv=overview`
öffnen (gleicher Ansatz wie Stage 1s TV-Sync-Check), prüfen dass
`GroupTv` die Gruppentabellen zeigt, keine Konsolenfehler.

- [ ] **Schritt 5: Commit**

```bash
git add dart-turnier.jsx
git commit -m "TV-Ansicht für Gruppenphase (GroupTv)

KO-Phase des Gruppenmodus bewusst ohne eigene TV-Ansicht in dieser
Iteration (Scope-Notiz im Code) — Folge-Iteration falls gebraucht."
```

---

### Task 8: Persistenz + vollständige E2E-Verifikation

**Files:**
- Modify: `dart-turnier.jsx` (`save`/`load`-Aufrufe um `tournament`/`config.format` erweitert)
- Test: neues Playwright-Skript im Scratchpad (kein Repo-File)

- [ ] **Schritt 1: Persistenz erweitern**

`save`-Aufruf (bestehender `useEffect`):
```js
useEffect(()=>{if(bracket||tournament)save({bracket,tournament,config,sounds});},[bracket,tournament,config,sounds]);
```
Load-Pfad (`useEffect` beim Mount):
```js
if(saved?.bracket){ /* ...unverändert, K.-o.-Pfad... */ }
else if(saved?.tournament){
  setTournament(saved.tournament);setConfig(saved.config||config);setSounds(saved.sounds||{});customSounds=saved.sounds||{};
  if(tvParam==='overview'){setPhase("tv-overview");}
  else{setPhase("groups");}
}
else{setTeamNames(Array(8).fill(""));setPhase("setup");}
```
TV-`storage`-Event-Listener ebenfalls um `tournament` ergänzen (gleiches
Muster wie der bestehende `s.bracket`-Zweig, zusätzlich `s.tournament`
prüfen und `setTournament` aufrufen).

`bracket`- und `tournament`-Shape sind komplett getrennte, additive
Felder im gespeicherten Objekt — **kein Storage-Key-Bump nötig** (anders
als bei Stage 1: dort hatte sich die Shape von *bestehenden* Daten
geändert, hier kommt nur ein neues, optionales Feld dazu — alte
Single-Elim-Stände laden weiter unverändert).

- [ ] **Schritt 2: Build**

```bash
cd _preview && npm run build && cd .. && npm test
```
Erwartet: Build fehlerfrei, 157/157 Tests grün (keine `src/`-Änderungen).

- [ ] **Schritt 3: Vollständiges Playwright-E2E-Skript**

Im Scratchpad (nicht Teil des Repos, gleiches Vorgehen wie Stage 1):
kompletter Durchlauf — Setup mit Gruppen-Format (2 Gruppen, Advance 2,
8 Teams) → Auslosung → alle 12 Gruppenspiele deterministisch
durchspielen (gleiche `enterTotal`-Helper-Funktion, wiederverwendet aus
Stage 1s Skript) → Tabellen-Assertions (Punkte/Rank korrekt) →
Phasenübergang → KO-Playoff (Halbfinale/Finale/Platz-3) zu Ende spielen
→ Turniersieger-Assertion → TV-Fenster-Check (`GroupTv` während
Gruppenphase) → Reload-Persistenz-Check (Seite neu laden, Zustand
bleibt erhalten) → `errors.length===0`-Assertion wie in Stage 1.

- [ ] **Schritt 4: Skript ausführen, alle Assertions grün**

```bash
node smoke-groups.mjs
```
Erwartet: alle `ok:`-Zeilen, keine `FAIL:`-Zeilen, `no console/page errors: []`.

- [ ] **Schritt 5: Finaler Commit + Push auf Feature-Branch**

```bash
git add dart-turnier.jsx
git commit -m "Persistenz für Gruppenphase + vollständige E2E-Verifikation

save/load um tournament-Feld erweitert, additiv, kein Storage-Key-Bump
nötig (bestehende Single-Elim-Stände unberührt). Playwright-E2E deckt
kompletten Gruppen+Playoff-Durchlauf inkl. TV und Reload-Persistenz ab."
git push -u origin feature/gruppenphase
```

**Nicht Merge nach `master`** — wie bei Stage 1 erst nach manueller
Prüfung durch den Nutzer (Branch deployen zum Testen, siehe Stage 1s
Ablauf: Branch zur `github-pages`-Deployment-Branch-Policy hinzufügen,
`gh workflow run pages.yml --ref feature/gruppenphase`, nach Test wieder
entfernen).

---

## Self-Review

**Spec-Abdeckung:** Format-Wahl additiv (Task 2), Gruppenzahl/Advance-Count
konfigurierbar (Task 2), getrennte Regeln pro Phase (Task 2+5), Gruppen-
Auslosung via `shuffle()` (Task 3), Gruppentabellen (Task 3), Playoff-
Übergang (Task 5), TV-Gruppentabelle (Task 7), Persistenz additiv ohne
Schema-Bruch (Task 8) — alle Spec-Punkte haben einen Task. TV für
KO-Phase des Gruppenmodus bewusst nicht abgedeckt (im Plan explizit als
Scope-Grenze vermerkt, nicht vergessen).

**Typkonsistenz geprüft:** `ensureGame`/`handleGroupUpdate`/`findTournamentMatch`
werden in Tasks 4-6 identisch benannt und verwendet, keine Drift. `t1Name`/
`t2Name`-Prop-Namen aus Task 1 durchgängig in Tasks 4/5 genutzt.
