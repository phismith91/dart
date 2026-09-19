# Darts-Eingabe-Redesign + Gruppenliste-Trennung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `dart-turnier.jsx`s Darts-Eingabe-Tab bekommt ein 3-Spalten-Grid (S/D/T immer sichtbar, kein Umschalten mehr) plus eine manuelle Text-Eingabe ("T20"/"D25"/"0"), und `GroupOverview`s Matchliste wird in 2 klar getrennte Gruppen-Spalten aufgeteilt statt einem gemischten Grid.

**Architektur:** Reine UI-Änderung in der bestehenden Datei, kein neuer Zustand außerhalb der beiden betroffenen Komponenten. `addDart` bekommt den Multiplikator als expliziten Parameter statt ihn aus einem Umschalter-State zu lesen — macht den States `mm`/`setMm` überflüssig. Validierung der Text-Eingabe nutzt die bereits vorhandene `isValidDart()` aus `src/types.js`, keine neue Validierungslogik nötig.

**Tech Stack:** React 18 (dart-turnier.jsx, Single-File-Prototyp, kein Build-Schritt außer `_preview/`-Vite-Dev-Server). Referenz-Spec: `docs/superpowers/specs/2026-09-19-darts-eingabe-gruppenliste-design.md`.

---

## Vorab: Dev-Server für manuelle Verifikation

```bash
cd /home/philipp/projects/dart/.worktrees/darts-eingabe-ux/_preview && npm install && npm run dev -- --port 5174
```

(Port 5174 statt 5173, falls der Gruppenphase-Worktree-Server noch parallel läuft.)

---

### Task 1: Darts-Tab — 3-Spalten-Grid + manuelle Text-Eingabe

**Files:**
- Modify: `/home/philipp/projects/dart/.worktrees/darts-eingabe-ux/dart-turnier.jsx` (Import-Zeile, `ScoringView`s State, `addDart`, `renderDarts`)

- [ ] **Step 1: `isValidDart` importieren**

Aktuell (Zeile 5):

```js
import { IMPOSSIBLE_TOTALS, dartValue, dartLabel } from "./src/types.js";
```

neu:

```js
import { IMPOSSIBLE_TOTALS, dartValue, dartLabel, isValidDart } from "./src/types.js";
```

- [ ] **Step 2: `mm`-State durch die neuen States für die Text-Eingabe ersetzen**

Aktuell (Zeile 295, innerhalb `function ScoringView(...)`):

```js
  const[mm,setMm]=useState("S");
```

neu:

```js
  const[dartInput,setDartInput]=useState("");
  const[dartInputError,setDartInputError]=useState(false);
```

- [ ] **Step 3: `addDart` auf expliziten Multiplikator-Parameter umstellen**

Aktuell (Zeile 351):

```js
  const addDart=(f)=>{if(darts.length>=3)return;if(f===25&&mm==="T")return;setDarts([...darts,{field:f,multi:f===0?"S":mm}]);};
```

neu:

```js
  const addDart=(f,multi)=>{if(darts.length>=3)return;setDarts([...darts,{field:f,multi}]);};

  // Parst "T20"/"D25"/"0" usw. aus dem manuellen Text-Feld und legt denselben
  // addDart()-Pfad wie die Grid-Buttons an — landet in derselben darts[]-Queue,
  // gleiches Undo-/Submit-Verhalten, keine Sonderbehandlung nötig.
  const submitDartInput=()=>{
    if(darts.length>=3)return;
    const raw=dartInput.trim().toUpperCase();
    if(raw==="0"){addDart(0,"S");setDartInput("");return;}
    const match=raw.match(/^([SDT])(\d{1,2}|25)$/);
    const field=match?Number(match[2]):NaN;
    const multi=match?match[1]:null;
    if(!match||!isValidDart(field,multi)){
      setDartInputError(true);
      setTimeout(()=>setDartInputError(false),600);
      return;
    }
    addDart(field,multi);
    setDartInput("");
  };
```

(`isValidDart(25,'T')` gibt bereits `false` zurück — kein Sonderfall für Triple-Bull nötig, siehe `src/types.js`.)

- [ ] **Step 4: `renderDarts()` komplett ersetzen**

Aktuell (Zeile 434-453):

```js
  const renderDarts=()=>{
    const mc={S:textMid,D:green,T:colRed};const ml={S:"Single",D:"Double",T:"Triple"};const fields=[20,19,18,17,16,15,14,13,12,11,10,9,8,7,6,5,4,3,2,1];
    return<div style={{padding:"6px 8px",flex:1,display:"flex",flexDirection:"column"}}>
      <div style={{display:"flex",gap:6,justifyContent:"center",padding:"6px 0",minHeight:42}}>
        {[0,1,2].map(i=><div key={i} style={{width:70,padding:"6px 0",borderRadius:8,textAlign:"center",background:darts[i]?greenDark:card,border:`1px solid ${darts[i]?greenBdr:bdr}`}}>{darts[i]?<><div style={{fontSize:14,fontWeight:700,color:mc[darts[i].multi]}}>{dl(darts[i])}</div><div style={{fontSize:9,color:textLow}}>{dv(darts[i])}</div></>:<div style={{fontSize:11,color:textOff}}>Dart {i+1}</div>}</div>)}
        {darts.length>0&&<div style={{alignSelf:"center",padding:"6px 10px",background:colBlueDk,borderRadius:8,border:`1px solid ${colBlue}`}}><div className="score-num" style={{fontSize:18,fontWeight:700,color:textHi}}>{dTotal}</div></div>}
      </div>
      <div style={{display:"flex",gap:6,padding:"4px 0 8px",justifyContent:"center"}}>
        {["S","D","T"].map(m=><button key={m} onClick={()=>setMm(m)} aria-pressed={mm===m} style={{flex:1,maxWidth:100,padding:"10px 0",borderRadius:8,background:mm===m?(m==="S"?colBlueDk:m==="D"?greenDark:colRedDk):card,border:`2px solid ${mm===m?mc[m]:bdr}`,color:mm===m?mc[m]:textLow,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:F}}>{ml[m]}</button>)}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:5,flex:1,alignContent:"start"}}>
        {fields.map(f=>{const v=f*(mm==="T"?3:mm==="D"?2:1);const dis3=darts.length>=3;return<button key={f} onClick={()=>addDart(f)} aria-disabled={dis3?"true":undefined} style={{background:dis3?bg:surf2,border:`1px solid ${dis3?bdrSoft:bdr}`,borderRadius:6,padding:"10px 0",color:dis3?textOff:mc[mm],fontSize:15,fontWeight:600,cursor:dis3?"default":"pointer",fontFamily:F}}><div>{f}</div><div style={{fontSize:9,color:textLow}}>{v}</div></button>})}
        <button onClick={()=>darts.length<3&&addDart(25)} aria-disabled={darts.length>=3||mm==="T"?"true":undefined} style={{background:darts.length>=3||mm==="T"?bg:surf2,border:`1px solid ${darts.length>=3||mm==="T"?bdrSoft:bdr}`,borderRadius:6,padding:"10px 0",color:darts.length>=3||mm==="T"?textOff:orange,fontSize:13,fontWeight:700,cursor:darts.length>=3||mm==="T"?"default":"pointer",fontFamily:F}}><div>Bull</div><div style={{fontSize:9,color:textLow}}>{mm==="D"?50:25}</div></button>
        <button onClick={()=>darts.length<3&&addDart(0)} aria-disabled={darts.length>=3?"true":undefined} style={{background:darts.length>=3?bg:surf2,border:`1px solid ${darts.length>=3?bdrSoft:bdr}`,borderRadius:6,padding:"10px 0",color:darts.length>=3?textOff:textLow,fontSize:13,fontWeight:600,cursor:darts.length>=3?"default":"pointer",fontFamily:F}}><div>Miss</div></button>
      </div>
      <div style={{display:"flex",gap:6,padding:"8px 0"}}>
        <button onClick={()=>darts.length&&setDarts(darts.slice(0,-1))} disabled={!darts.length} aria-label="Letzten Dart entfernen" style={{flex:1,padding:"0",background:surf2,border:`1px solid ${bdr}`,borderRadius:8,color:darts.length?orange:textOff,fontSize:14,fontFamily:F}}>↩</button>
        <button onClick={()=>{if(darts.length){addDarts(darts);setDarts([]);}}} style={{flex:2,padding:"10px 0",background:darts.length?green:surf2,border:`1px solid ${darts.length?green:bdr}`,borderRadius:8,color:darts.length?bg:textOff,fontSize:14,fontWeight:700,cursor:darts.length?"pointer":"default",fontFamily:F}}>{darts.length?`${dTotal} eintragen`:"Darts eingeben"}</button>
      </div>
    </div>;};
```

neu:

```js
  const renderDarts=()=>{
    const mc={S:textMid,D:green,T:colRed};
    const fields=[20,19,18,17,16,15,14,13,12,11,10,9,8,7,6,5,4,3,2,1];
    const dis3=darts.length>=3;
    const cell=(field,multi,label)=><button key={multi} onClick={()=>addDart(field,multi)} aria-disabled={dis3?"true":undefined} style={{background:dis3?bg:surf2,border:`1px solid ${dis3?bdrSoft:bdr}`,borderRadius:6,padding:"6px 0",color:dis3?textOff:mc[multi],fontSize:14,fontWeight:600,cursor:dis3?"default":"pointer",fontFamily:F}}>{label}</button>;
    return<div style={{padding:"6px 8px",flex:1,display:"flex",flexDirection:"column"}}>
      <div style={{display:"flex",gap:6,justifyContent:"center",padding:"6px 0",minHeight:42}}>
        {[0,1,2].map(i=><div key={i} style={{width:70,padding:"6px 0",borderRadius:8,textAlign:"center",background:darts[i]?greenDark:card,border:`1px solid ${darts[i]?greenBdr:bdr}`}}>{darts[i]?<><div style={{fontSize:14,fontWeight:700,color:mc[darts[i].multi]}}>{dl(darts[i])}</div><div style={{fontSize:9,color:textLow}}>{dv(darts[i])}</div></>:<div style={{fontSize:11,color:textOff}}>Dart {i+1}</div>}</div>)}
        {darts.length>0&&<div style={{alignSelf:"center",padding:"6px 10px",background:colBlueDk,borderRadius:8,border:`1px solid ${colBlue}`}}><div className="score-num" style={{fontSize:18,fontWeight:700,color:textHi}}>{dTotal}</div></div>}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"24px 1fr 1fr 1fr",gap:4,padding:"2px 0 4px"}}>
        <div/>
        {["S","D","T"].map(m=><div key={m} style={{textAlign:"center",fontSize:10,fontWeight:700,color:mc[m],letterSpacing:"0.05em"}}>{m}</div>)}
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:3}}>
        {fields.map(f=><div key={f} style={{display:"grid",gridTemplateColumns:"24px 1fr 1fr 1fr",gap:4,alignItems:"center"}}>
          <div style={{fontSize:11,color:textLow,textAlign:"right",paddingRight:4}}>{f}</div>
          {cell(f,"S",f)}
          {cell(f,"D",f*2)}
          {cell(f,"T",f*3)}
        </div>)}
        <div style={{display:"grid",gridTemplateColumns:"24px 1fr 1fr 1fr",gap:4,alignItems:"center"}}>
          <div style={{fontSize:9,color:textLow,textAlign:"right",paddingRight:4}}>Bull</div>
          {cell(25,"S",25)}
          {cell(25,"D",50)}
          <div/>
        </div>
      </div>
      <button onClick={()=>!dis3&&addDart(0,"S")} aria-disabled={dis3?"true":undefined} style={{marginTop:6,padding:"8px 0",background:dis3?bg:surf2,border:`1px solid ${dis3?bdrSoft:bdr}`,borderRadius:6,color:dis3?textOff:textLow,fontSize:12,fontWeight:600,cursor:dis3?"default":"pointer",fontFamily:F}}>Miss</button>
      <div style={{display:"flex",gap:6,padding:"10px 0 4px"}}>
        <input value={dartInput} onChange={e=>{setDartInput(e.target.value);setDartInputError(false);}} onKeyDown={e=>{if(e.key==="Enter")submitDartInput();}} placeholder="z.B. T20, D25, 0" aria-label="Dart manuell eingeben" style={{flex:1,background:surf2,border:`1px solid ${dartInputError?colRed:bdr}`,borderRadius:6,padding:"8px 10px",color:textHi,fontFamily:F,fontSize:13,boxSizing:"border-box"}}/>
        <button onClick={submitDartInput} disabled={dis3||!dartInput.trim()} style={{padding:"0 16px",background:surf2,border:`1px solid ${bdr}`,borderRadius:6,color:green,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:F}}>OK</button>
      </div>
      <div style={{display:"flex",gap:6,padding:"4px 0"}}>
        <button onClick={()=>darts.length&&setDarts(darts.slice(0,-1))} disabled={!darts.length} aria-label="Letzten Dart entfernen" style={{flex:1,padding:"0",background:surf2,border:`1px solid ${bdr}`,borderRadius:8,color:darts.length?orange:textOff,fontSize:14,fontFamily:F}}>↩</button>
        <button onClick={()=>{if(darts.length){addDarts(darts);setDarts([]);}}} style={{flex:2,padding:"10px 0",background:darts.length?green:surf2,border:`1px solid ${darts.length?green:bdr}`,borderRadius:8,color:darts.length?bg:textOff,fontSize:14,fontWeight:700,cursor:darts.length?"pointer":"default",fontFamily:F}}>{darts.length?`${dTotal} eintragen`:"Darts eingeben"}</button>
      </div>
    </div>;};
```

(`dv`/`dl`/`dTotal`/`addDarts`/`darts`/`setDarts` sind bestehende Closures aus `ScoringView`, unverändert weiterverwendet.)

- [ ] **Step 5: Verifizieren**

```bash
cd /home/philipp/projects/dart/.worktrees/darts-eingabe-ux
grep -n "\bmm\b" dart-turnier.jsx
```
Expected: keine Treffer mehr (State komplett entfernt).

```bash
npm test
```
Expected: 727 passed, 0 failed (unverändert — dieser Task berührt nur `dart-turnier.jsx`, nicht `src/`).

```bash
npx esbuild dart-turnier.jsx --bundle --loader:.jsx=jsx --external:react --external:react-dom --external:tone
```
Expected: exit 0, kein Fehler.

Danach im Dev-Server (siehe "Vorab") manuell: Match öffnen → Tab "Darts" → prüfen dass pro Zeile 3 Buttons (S/D/T) da sind, Bull-Zeile zeigt 25 und 50 nebeneinander ohne Umschalten, Textfeld akzeptiert z.B. "T20" (→ erscheint als erster Dart-Slot oben) und lehnt z.B. "T25" mit rotem Rahmen ab.

- [ ] **Step 6: Commit**

```bash
git add dart-turnier.jsx
git commit -m "$(cat <<'EOF'
Darts-Tab: 3-Spalten-Grid (S/D/T immer sichtbar) + manuelle Text-Eingabe

Ersetzt den Single/Double/Triple-Umschalter (mm-State) durch ein Grid,
das pro Feld alle drei Multiplikatoren gleichzeitig zeigt — 1 Tap pro
Wurf statt 2, Bull (25) und Bullseye (50) sind jetzt immer beide
sichtbar statt vom aktuellen Modus abzuhängen. addDart() bekommt den
Multiplikator jetzt explizit vom Aufrufer statt ihn aus dem Umschalter
zu lesen.

Zusätzlich: manuelle Text-Eingabe ("T20"/"D25"/"0") als schnelle
Alternative, validiert über die bereits vorhandene isValidDart() aus
src/types.js (lehnt z.B. "T25" korrekt ab — kein Triple-Bull).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: GroupOverview — 2 getrennte Gruppen-Spalten statt gemischtem Grid

**Files:**
- Modify: `/home/philipp/projects/dart/.worktrees/darts-eingabe-ux/dart-turnier.jsx` (`GroupOverview`)

- [ ] **Step 1: Match-Liste in `GroupOverview` aufteilen**

Aktuell (innerhalb `function GroupOverview(...)`, suche nach `groupPhase.order.map`):

```js
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:10}}>
        {groupPhase.order.map(m=><MatchCard key={m.id} match={m} teams={groupPhase.teams} onOpen={onOpen}/>)}
      </div>
```

neu:

```js
      <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
        <div style={{flex:1,minWidth:260,display:"flex",flexDirection:"column",gap:8}}>
          <div style={{fontSize:11,fontWeight:700,color:green}}>Gruppe 1</div>
          {groupPhase.group1.map(m=><MatchCard key={m.id} match={m} teams={groupPhase.teams} onOpen={onOpen}/>)}
        </div>
        <div style={{flex:1,minWidth:260,display:"flex",flexDirection:"column",gap:8}}>
          <div style={{fontSize:11,fontWeight:700,color:green}}>Gruppe 2</div>
          {groupPhase.group2.map(m=><MatchCard key={m.id} match={m} teams={groupPhase.teams} onOpen={onOpen}/>)}
        </div>
      </div>
```

(`MatchCard` bleibt unverändert — nur die Datenquelle ändert sich von `groupPhase.order` auf die beiden getrennten Arrays `group1`/`group2`. `groupPhase.order` wird weiterhin von `TvGroupOverview` verwendet, hier nicht anfassen.)

- [ ] **Step 2: Verifizieren**

```bash
cd /home/philipp/projects/dart/.worktrees/darts-eingabe-ux
npm test
```
Expected: 727 passed, 0 failed (unverändert).

```bash
npx esbuild dart-turnier.jsx --bundle --loader:.jsx=jsx --external:react --external:react-dom --external:tone
```
Expected: exit 0.

Danach im Dev-Server: Turnier mit 8 Teams starten, Gruppenphase-Screen öffnen — die 12 Spiele müssen jetzt als 2 klar beschriftete Spalten "Gruppe 1"/"Gruppe 2" mit je 6 Karten erscheinen, nicht mehr gemischt.

- [ ] **Step 3: Commit**

```bash
git add dart-turnier.jsx
git commit -m "$(cat <<'EOF'
GroupOverview: Matchliste in 2 getrennte Gruppen-Spalten aufteilen

Die 12 Gruppenspiele lagen bisher in einem gemischten order-basierten
Grid (G1/G2 durcheinander) — Feedback: nicht erkennbar welche 6 Spiele
zu welcher Gruppe gehören. Jetzt 2 beschriftete Spalten, je Gruppe ihre
6 Spiele. MatchCard unverändert, nur andere Datenquelle. Betrifft nur
die On-Screen-Ansicht, nicht TvGroupOverview (kein Feedback dazu).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: End-to-End-Verifikation

**Files:** keine Code-Änderungen — reine Verifikation.

- [ ] **Step 1: Kompletten Regressionslauf**

```bash
cd /home/philipp/projects/dart/.worktrees/darts-eingabe-ux && npm test
```
Expected: 727 passed, 0 failed.

- [ ] **Step 2: Production-Build**

```bash
cd /home/philipp/projects/dart/.worktrees/darts-eingabe-ux/_preview && npm run build
```
Expected: sauberer Build, kein Fehler (gleicher Check wie schon in der Gruppenphase-Verifikation verwendet).

- [ ] **Step 3: Manueller Durchlauf durch den User**

Dev-Server (siehe "Vorab") — Match öffnen, Tab "Darts":
- Jede Zahl 1-20 hat 3 Tap-Ziele (S/D/T) nebeneinander, kein Umschalten nötig.
- Bull-Zeile zeigt 25 (S) und 50 (D) permanent.
- Textfeld: "T20" einträgt korrekt einen Dart, "T25" wird abgelehnt (roter Rahmen), "0" trägt Miss ein.

Gruppenphase-Screen (8 Teams starten):
- Matchliste zeigt 2 klar getrennte, beschriftete Spalten statt einem gemischten Grid.

- [ ] **Step 4: Branch-Status prüfen**

```bash
cd /home/philipp/projects/dart/.worktrees/darts-eingabe-ux && git status --short && git log --oneline feature/gruppenphase-saetze-turnier..feature/darts-eingabe-ux
```
Erwartet: sauberer Working Tree, 2 Commits (Task 1 + Task 2) sichtbar oben auf `feature/gruppenphase-saetze-turnier`.

---

## Nach Abschluss

`feature/darts-eingabe-ux` ist ein gestapelter Branch auf `feature/gruppenphase-saetze-turnier` (noch nicht gemergt) — beim finalen Merge zuerst `feature/gruppenphase-saetze-turnier` nach `master`, danach `feature/darts-eingabe-ux` nach `master` (oder direkt zusammen, falls beide gleichzeitig fertig sind). Klickbare SVG-Dartscheibe (separat gewünscht) kommt danach als eigene Spec.
