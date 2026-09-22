import { useState, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as Tone from "tone";
import { throwTotal, throwDarts, undoTurn, undoLeg as engineUndoLeg, setStarter, getStats, createGame } from "./src/engine.js";
import { getCheckout as engineGetCheckout } from "./src/checkouts.js";
import { IMPOSSIBLE_TOTALS, dartValue, dartLabel, isValidDart } from "./src/types.js";
import { newMatch, buildGroups, groupStandings } from "./groups.js";

// ═══════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════
const COMMON = new Set([0,20,26,30,40,41,45,50,54,55,57,60,80,81,85,95,100,105,120,121,125,133,137,140,160,170,174,177,180]);
const FAVORITES = [0,26,41,45,60,80,85,100,121,140,180];

const SOUND_EVENTS=[{key:"180",label:"180!"},{key:"140",label:"140+"},{key:"100",label:"100+"},{key:"checkout",label:"Checkout"},{key:"bust",label:"Bust"},{key:"winner",label:"Sieger"}];

const ROUND_NAMES={1:"Finale",2:["Halbfinale","Finale"],3:["Viertelfinale","Halbfinale","Finale"],4:["Achtelfinale","Viertelfinale","Halbfinale","Finale"]};

// ═══════════════════════════════════════════
// SOUNDS
// ═══════════════════════════════════════════
let customSounds={};
const audioCache={};
let toneReady=false;
const initTone=async()=>{if(!toneReady){await Tone.start();toneReady=true;}};

const playCustomUrl=(url)=>{try{if(!audioCache[url])audioCache[url]=new Audio(url);const a=audioCache[url];a.currentTime=0;a.play().catch(()=>{});}catch(e){}};

const playFallback=async(t)=>{await initTone();const s=new Tone.Synth({oscillator:{type:"triangle"},envelope:{attack:0.01,decay:0.3,sustain:0.1,release:0.3}}).toDestination();const n=Tone.now();const p=new Tone.PolySynth(Tone.Synth).toDestination();
if(t==="180"){p.triggerAttackRelease(["C5","E5","G5"],0.3,n);p.triggerAttackRelease(["C5","E5","G5","C6"],0.5,n+0.3);}
else if(t==="140"){s.triggerAttackRelease("E5",0.15,n);s.triggerAttackRelease("G5",0.15,n+0.15);s.triggerAttackRelease("C6",0.3,n+0.3);}
else if(t==="100"){s.triggerAttackRelease("C5",0.15,n);s.triggerAttackRelease("E5",0.2,n+0.15);}
else if(t==="checkout"){p.triggerAttackRelease(["C5","E5"],0.2,n);p.triggerAttackRelease(["G5","C6","E6"],0.5,n+0.4);}
else if(t==="bust"){s.triggerAttackRelease("E3",0.4,n);}
else if(t==="winner"){["C5","E5","G5","C6","E6"].forEach((x,i)=>p.triggerAttackRelease(x,0.3,n+i*0.15));}
setTimeout(()=>{s.dispose();p.dispose();},3000);};

const playSound=async(t)=>{try{const u=customSounds[t];if(u&&u.trim())playCustomUrl(u.trim());else await playFallback(t);}catch(e){}};

// ═══════════════════════════════════════════
// STORAGE
// ═══════════════════════════════════════════
// v3: Match-Objekte tragen jetzt ein eingebettetes Engine-Spiel (match.game) statt
// leg1/leg2/s1/s2/history1/history2 — Key bumpen, damit alte v2-Turnierstände (anderes
// Schema, kein .game) beim Laden nicht mehr gezogen werden und die App crashen (sonst:
// "Cannot read properties of undefined (reading 'legs')" bei leerem Bildschirm).
const SK="dart-turnier-v3";
const save=async(s)=>{try{await window.storage.set(SK,JSON.stringify(s));return true;}catch(e){return false;}};
const load=async()=>{try{const r=await window.storage.get(SK);return r?JSON.parse(r.value):null;}catch(e){return null;}};
const clear=async()=>{try{await window.storage.delete(SK);}catch(e){}};

// ═══════════════════════════════════════════
// THEME (Dark/Light, persistiert in localStorage — unabhängig vom Turnier-Storage)
// ═══════════════════════════════════════════
const THEME_KEY="dart-turnier-theme";
const applyTheme=(t)=>{document.documentElement.dataset.theme=t;try{localStorage.setItem(THEME_KEY,t);}catch(e){}};
const getInitialTheme=()=>{try{return localStorage.getItem(THEME_KEY)||"dark";}catch(e){return "dark";}};

// ═══════════════════════════════════════════
// LIVE EVENTS (Bust/180/Checkout/Sieger vom Scoring-Gerät ans TV-Fenster senden)
// ═══════════════════════════════════════════
// Der native "storage"-Event feuert nur in ANDEREN Fenstern/Tabs, nie im schreibenden
// selbst — genau das brauchen wir hier: das TV-Fenster reagiert, das Scoring-Gerät
// (das den Sound/Flash schon lokal zeigt) bekommt kein doppeltes Echo. Eigener Key statt
// im großen Turnierstand (SK), da es ein kurzlebiges Einmal-Signal ist, kein Zustand.
const EVENT_KEY="dart-turnier-event";
const broadcastEvent=(type,matchId)=>{try{localStorage.setItem(EVENT_KEY,JSON.stringify({type,matchId,ts:Date.now()}));}catch(e){}};

// ═══════════════════════════════════════════
// BRACKET ENGINE (dynamic team count)
// ═══════════════════════════════════════════
function shuffle(arr){const a=[...arr];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}

// Aus dem Engine-Turn-Log (interleaved, beide Spieler) die Pro-Spieler-Wurf-Historie des
// aktuellen Legs ableiten — für die Verlaufs-Anzeige, die Engine trackt nur turns[] gesamt.
function legHistory(game,player){return game.turns.filter(t=>t.player===player).map(t=>t.score);}

// Alle Aufnahmen des gesamten Spiels (abgeschlossene Legs aus legResults + laufendes Leg
// aus turns) für die Verlauf-Anzeige — Engine räumt turns[] bei jedem Leg-Sieg leer, die
// abgeschlossenen Legs liegen nur noch in legResults[].turns.
function fullMatchHistory(game){
  const entries=[];
  game.legResults.forEach(lr=>lr.turns.forEach(t=>entries.push({...t,leg:lr.leg})));
  game.turns.forEach(t=>entries.push({...t,leg:game.currentLeg}));
  return entries;
}

// Checkout-Vorschlag fürs TV/Scoring — nutzt die echte Checkout-Tabelle aus src/checkouts.js
// (auch für Single Out ein echter Mehr-Dart-Pfad statt eines Platzhalters).
function checkoutSuggestion(rem,isDoubleOut){
  const co=engineGetCheckout(rem,isDoubleOut?"double":"single");
  return co?co.path:null;
}

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
      const match=newMatch(`r${r}m${m}`,t1,t2,r,false,isDoubleOut,legsToWinHere,config.startScore);
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
    rounds.push({matches:[newMatch("3rd",null,null,numRounds,true,config.finalDoubleOut,thirdLegsToWin,config.startScore)],name:"Platz 3",isDoubleOut:config.finalDoubleOut,legsToWin:thirdLegsToWin});
  }
  return{teams:[...teams],rounds,config};
}

function propagateBracket(b){
  const mainRounds=b.rounds.filter(r=>!r.matches[0]?.isThirdPlace);
  for(let r=1;r<mainRounds.length;r++){
    const prev=mainRounds[r-1].matches;
    const curr=mainRounds[r].matches;
    for(let m=0;m<curr.length;m++){
      curr[m].t1=prev[m*2]?.winner??null;
      curr[m].t2=prev[m*2+1]?.winner??null;
    }
  }
  // Third-place: losers of SF (second-to-last main round)
  const thirdRound=b.rounds.find(r=>r.matches[0]?.isThirdPlace);
  if(thirdRound&&mainRounds.length>=2){
    const sf=mainRounds[mainRounds.length-2].matches;
    if(sf.length===2){
      thirdRound.matches[0].t1=sf[0].winner!==null?(sf[0].t1===sf[0].winner?sf[0].t2:sf[0].t1):null;
      thirdRound.matches[0].t2=sf[1].winner!==null?(sf[1].t1===sf[1].winner?sf[1].t2:sf[1].t1):null;
    }
  }
}

function getMatch(b,id){for(const r of b.rounds){const m=r.matches.find(x=>x.id===id);if(m)return{match:m,round:r};}return null;}
function setMatchIn(b,match){for(const r of b.rounds){const i=r.matches.findIndex(x=>x.id===match.id);if(i!==-1){r.matches[i]=match;return;}}}
function getChampion(b){const mainRounds=b.rounds.filter(r=>!r.matches[0]?.isThirdPlace);const fin=mainRounds[mainRounds.length-1];return fin?.matches[0]?.winner!==null?b.teams[fin.matches[0].winner]:null;}
function findLiveMatch(b){
  for(const round of b.rounds){
    for(const m of round.matches){
      const ready=m.t1!==null&&m.t2!==null;
      const started=ready&&(m.started||m.game.turns.length>0||m.game.legResults.length>0);
      if(started&&m.winner===null)return{match:m,round};
    }
  }
  return null;
}
// Sucht ein Match sowohl im Bracket (K.o.) als auch in der Gruppenphase — ScoringView
// braucht dieselbe {match,round}-Form unabhängig davon, woher das Match kommt.
function findMatchAnywhere(bracket,groupPhase,id){
  if(bracket){const r=getMatch(bracket,id);if(r)return{...r,teams:bracket.teams};}
  if(groupPhase){
    const m=groupPhase.order.find(x=>x.id===id);
    // .includes() funktioniert hier nur, weil groupPhase.order dieselben Objekt-Referenzen
    // enthält wie group1/group2 (buildGroups() befüllt order direkt aus group1/group2-Arrays,
    // structuredClone beim Speichern/Laden erhält diese gemeinsame Identität pro Snapshot).
    if(m)return{match:m,round:{name:groupPhase.group1.includes(m)?"Gruppe 1":"Gruppe 2",isDoubleOut:false},teams:groupPhase.teams};
  }
  return null;
}
function findLiveGroupMatch(groupPhase){
  for(const m of groupPhase.order){
    const started=m.started||m.game.turns.length>0||m.game.legResults.length>0;
    if(started&&m.winner===null)return{match:m,round:{name:groupPhase.group1.includes(m)?"Gruppe 1":"Gruppe 2",isDoubleOut:false}};
  }
  return null;
}

// ═══════════════════════════════════════════
// STATS (computed from match data — undo-safe)
// ═══════════════════════════════════════════
function computeStats(bracket){
  if(!bracket)return[];
  const agg=bracket.teams.map((name,i)=>({name,i,scoreSum:0,totalThrows:0,legs:0,matchesWon:0,ton80:0,ton40:0,ton:0,highest:0}));
  for(const round of bracket.rounds){
    for(const m of round.matches){
      if(m.t1===null||m.t2===null)continue;
      // Pro-Match-Stats kommen direkt aus der Engine (getStats) statt Rohdaten von Hand zu summieren —
      // bust-inklusive, da die Engine gebustete Aufnahmen (score:0) im Turn-Log führt.
      const[st1,st2]=getStats(m.game);
      for(const[teamIdx,st] of[[m.t1,st1],[m.t2,st2]]){
        const a=agg[teamIdx];
        a.scoreSum+=st.average*st.totalThrows;
        a.totalThrows+=st.totalThrows;
        a.legs+=st.legs;
        a.ton80+=st.ton80;a.ton40+=st.ton40;a.ton+=st.ton;
        if(st.highest>a.highest)a.highest=st.highest;
      }
      if(m.winner!==null)agg[m.winner].matchesWon++;
    }
  }
  return agg.map(a=>({...a,avg:(a.totalThrows?a.scoreSum/a.totalThrows:0).toFixed(1)})).sort((a,b)=>b.avg-a.avg);
}

// ═══════════════════════════════════════════
// COLOR TOKENS (OKLCH — perceptually uniform)
// ═══════════════════════════════════════════
const F  = "'Figtree','Helvetica Neue',sans-serif";     // UI: labels, buttons, body
const FD = "'Funnel Display','Arial Narrow',sans-serif"; // Display: scores, headlines
// Surfaces — tinted toward hue 145 (green) for brand cohesion
// Werte kommen aus CSS-Variablen (siehe GlobalStyles) statt fix, damit Dark/Light per data-theme umschaltbar ist
const bg        = "var(--bg)";
const card      = "var(--card)";
const surf2     = "var(--surf2)";
const bdr       = "var(--bdr)";
const bdrSoft   = "var(--bdr-soft)";
// Text — hi/mid/low ≥4.5:1 on `bg` (WCAG AA); text-off ist bewusst die schwächste Stufe
// (disabled/dezente Labels), hält aber ≥3:1 (WCAG AA für UI-Komponenten/große Schrift)
const textHi    = "var(--text-hi)";
const textMid   = "var(--text-mid)";
const textLow   = "var(--text-low)";
const textOff   = "var(--text-off)";
// Accent — green (win, active, checkout)
const green     = "var(--green)";
const greenDark = "var(--green-dark)";
const greenText = "var(--green-text)";
const greenBdr  = "var(--green-bdr)";
// Warning — orange (Double Out, attention)
const orange     = "var(--orange)";
const orangeDark = "var(--orange-dark)";
// Status
const colRed    = "var(--col-red)";
const colRedDk  = "var(--col-red-dk)";
const colBlue   = "var(--col-blue)";
const colBlueDk = "var(--col-blue-dk)";

// ─── Global Styles (fonts + focus-visible + button reset) ───
function GlobalStyles(){
  useLayoutEffect(()=>{ // vor dem ersten Paint injizieren, sonst kurzer Flash ohne Farb-Tokens/Button-Reset
    if(document.getElementById("dart-global-styles"))return; // schon injiziert (App mountet diese Komponente pro Phase neu)
    const el=document.createElement("style");
    el.id="dart-global-styles";
    el.textContent=GLOBAL_STYLES_CSS;
    document.head.appendChild(el);
  },[]);
  return null;
}
const GLOBAL_STYLES_CSS=`
    :root{
      --bg: oklch(13% 0.006 145); --card: oklch(17% 0.007 145); --surf2: oklch(21% 0.006 145);
      --bdr: oklch(28% 0.007 145); --bdr-soft: oklch(21% 0.006 145);
      --text-hi: oklch(93% 0.003 145); --text-mid: oklch(72% 0.005 145); --text-low: oklch(62% 0.005 145); --text-off: oklch(48% 0.004 145);
      --green: oklch(75% 0.17 142); --green-dark: oklch(18% 0.04 142); --green-text: oklch(83% 0.14 142); --green-bdr: oklch(38% 0.12 142);
      --orange: oklch(77% 0.14 55); --orange-dark: oklch(17% 0.04 55);
      --col-red: oklch(70% 0.18 20); --col-red-dk: oklch(13% 0.04 20);
      --col-blue: oklch(67% 0.14 270); --col-blue-dk: oklch(13% 0.03 270);
    }
    :root[data-theme="light"]{
      --bg: oklch(97% 0.004 145); --card: oklch(100% 0 0); --surf2: oklch(94% 0.005 145);
      --bdr: oklch(83% 0.006 145); --bdr-soft: oklch(89% 0.005 145);
      --text-hi: oklch(20% 0.006 145); --text-mid: oklch(40% 0.006 145); --text-low: oklch(50% 0.006 145); --text-off: oklch(60% 0.004 145);
      --green: oklch(45% 0.16 142); --green-dark: oklch(93% 0.07 142); --green-text: oklch(32% 0.13 142); --green-bdr: oklch(70% 0.13 142);
      --orange: oklch(48% 0.13 55); --orange-dark: oklch(93% 0.07 55);
      --col-red: oklch(50% 0.18 20); --col-red-dk: oklch(93% 0.06 20);
      --col-blue: oklch(48% 0.14 270); --col-blue-dk: oklch(93% 0.05 270);
    }
    *:focus-visible{outline:2px solid ${green};outline-offset:2px;border-radius:3px;}
    button{font-family:${F};color:inherit;cursor:pointer;text-align:inherit;min-height:44px;box-sizing:border-box;transition:filter 130ms ease,transform 100ms ease,background 150ms ease,border-color 150ms ease;}
    button:not(:disabled):hover{filter:brightness(1.12);}
    button:not(:disabled):active{transform:scale(0.97);filter:brightness(0.95);}
    button:disabled{cursor:default;opacity:0.45;}
    input,textarea{font-family:${F};min-height:44px;transition:border-color 150ms ease;}
    input::placeholder,textarea::placeholder{color:${textOff};}
    input:not(:focus-visible),textarea:not(:focus-visible){outline:none;}
    .score-num{font-family:${FD};font-variant-numeric:tabular-nums;letter-spacing:-0.01em;}
    .label-upper{font-family:${F};letter-spacing:0.06em;font-weight:600;}
    .bracket-page{padding:12px;display:flex;flex-direction:column;gap:12px;}
    @media(min-width:768px){
      .bracket-page{display:grid;grid-template-columns:1fr 260px;grid-template-rows:auto 1fr;grid-template-areas:"hdr hdr" "main aside";gap:20px;padding:24px 32px;max-width:1400px;margin:0 auto;}
      .bracket-hdr{grid-area:hdr;}
      .bracket-main{grid-area:main;}
      .bracket-aside{grid-area:aside;}
    }
    .darts-cols{display:flex;gap:6px;}
    @media(max-width:380px){.darts-cols{flex-direction:column;}}
    @media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important;transform:none!important;}}
    @keyframes tv-bust{0%{opacity:0}5%{opacity:0.92}85%{opacity:0.92}100%{opacity:0}}
    @keyframes tv-winner{from{opacity:0;transform:scale(0.95)}to{opacity:1;transform:scale(1)}}
`;

// ═══════════════════════════════════════════
// SCORING VIEW
// ═══════════════════════════════════════════
function ScoringView({match,teams,roundName,isDoubleOut,onBack,onUpdate,isTV,tvControls}){
  const[ap,setAp]=useState(match.game.legStarter+1);
  const[bustMsg,setBust]=useState(null);
  const[tab,setTab]=useState(5);
  const[npad,setNpad]=useState("");
  const[showStarter,setShowStarter]=useState(!match.started);
  const[darts,setDarts]=useState([]);
  const[dartInput,setDartInput]=useState("");
  const[dartInputError,setDartInputError]=useState(false);

  const t1=match.t1!==null?teams[match.t1]:"—";
  const t2=match.t2!==null?teams[match.t2]:"—";
  const curLeg=match.game.legResults.length+1;
  const rem=ap===1?match.game.scores[0]:match.game.scores[1];
  const co1=useMemo(()=>checkoutSuggestion(match.game.scores[0],isDoubleOut),[match.game.scores[0],isDoubleOut]);
  const co2=useMemo(()=>checkoutSuggestion(match.game.scores[1],isDoubleOut),[match.game.scores[1],isDoubleOut]);

  // Gemeinsame Auswertung für throwTotal/throwDarts-Ergebnisse — Bust-/Sound-/Leg-/Match-Ende
  // kommt fertig aus der Engine, hier nur noch UI-Reaktion (Toast, Sound, wessen Zug/Sieger).
  const applyThrowResult=(res)=>{
    if(res.result.error){setBust("Unmöglich!");setTimeout(()=>setBust(null),1200);return;}
    const m=structuredClone(match);m.game=res.state;
    if(res.result.type==="BUST"){setBust("BUST!");playSound("bust");broadcastEvent("bust",match.id);setTimeout(()=>setBust(null),1200);setAp(m.game.currentPlayer+1);onUpdate(m);return;}
    const score=res.result.turn.score;
    if(score===180){playSound("180");broadcastEvent("180",match.id);}
    else if(score>=140){playSound("140");broadcastEvent("140",match.id);}
    else if(score>=100){playSound("100");broadcastEvent("100",match.id);}
    if(res.result.type==="LEG_WON"||res.result.type==="MATCH_WON"){
      playSound("checkout");broadcastEvent("checkout",match.id);
      if(res.result.type==="MATCH_WON"){m.winner=m.game.winner===0?m.t1:m.t2;setTimeout(()=>{playSound("winner");broadcastEvent("winner",match.id);},600);onUpdate(m);return;}
    }
    setAp(m.game.currentPlayer+1);onUpdate(m);
  };
  const addScore=(score)=>applyThrowResult(throwTotal(match.game,score));
  const addDarts=(dartsArr)=>applyThrowResult(throwDarts(match.game,dartsArr.map(d=>({field:d.field,multiplier:d.multi}))));

  // Enter trägt die aktuell eingegebene Aufnahme ein (Numpad-Rest oder Darts-Summe) statt Button-Klick.
  // Listener wird nur einmal gebunden (nicht bei jedem Tastendruck/Render neu) — liest den aktuellen
  // Stand über die Ref, die bei jedem Render aktualisiert wird (billig, kein Re-Subscribe nötig).
  const onEnterRef=useRef();
  onEnterRef.current=()=>{
    if(isTV||showStarter||match.winner!==null)return;
    if(tab===4&&npad){addScore(Number(npad));setNpad("");}
    else if(tab===5&&darts.length){addDarts(darts);setDarts([]);}
  };
  useEffect(()=>{
    const onKey=(e)=>{
      if(e.key!=="Enter")return;
      e.preventDefault(); // sonst aktiviert der Browser zusätzlich den zuletzt fokussierten Button (doppelte Eintragung)
      onEnterRef.current();
    };
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  },[]);

  // TV-Fenster hat kein eigenes Eingabegerät — bekommt Bust/180/Checkout/Sieger-Momente
  // per Live-Event vom Scoring-Gerät (siehe broadcastEvent), statt sie nie zu sehen/hören.
  useEffect(()=>{
    if(!isTV)return;
    const onSt=(e)=>{
      if(e.key!==EVENT_KEY||!e.newValue)return;
      try{
        const ev=JSON.parse(e.newValue);
        if(ev.matchId!==match.id)return;
        if(ev.type==="bust"){setBust("BUST!");playSound("bust");setTimeout(()=>setBust(null),1200);}
        else playSound(ev.type);
      }catch(err){}
    };
    window.addEventListener("storage",onSt);
    return()=>window.removeEventListener("storage",onSt);
  },[isTV,match.id]);

  // Zeigt nach dem Zurücknehmen die Darts der rückgängig gemachten Aufnahme wieder an,
  // damit man einzelne Darts korrigieren statt die ganze Aufnahme neu eintippen kann.
  // Nur möglich, wenn die Aufnahme über den Darts-Tab kam (turn.darts gesetzt) — bei
  // Numpad/Grid/Favoriten kennt die Engine nur die Summe (turn.score), die bei einem
  // Bust zudem nicht die tatsächlich eingegebene Zahl ist (Engine speichert sie nicht).
  const undoThrow=()=>{
    const lastTurn=match.game.turns[match.game.turns.length-1];
    const res=undoTurn(match.game);
    if(res.result.error)return;
    const m=structuredClone(match);m.game=res.state;
    setAp(m.game.currentPlayer+1);
    if(lastTurn?.darts){setDarts(lastTurn.darts.map(d=>({field:d.field,multi:d.multiplier})));setTab(5);}
    else if(lastTurn&&!lastTurn.isBust){setNpad(String(lastTurn.score));setTab(4);}
    onUpdate(m);
  };
  const undoLeg=()=>{const res=engineUndoLeg(match.game);if(res.result.error)return;const m=structuredClone(match);m.game=res.state;m.winner=null;setAp(m.game.currentPlayer+1);onUpdate(m);};
  const selectStarter=(p)=>{const res=setStarter(match.game,p-1);const m=structuredClone(match);m.game=res.state;m.started=true;setAp(p);setShowStarter(false);onUpdate(m);};
  // Spiellänge (301/501) pro Match umschaltbar, solange noch kein Dart geworfen wurde —
  // baut match.game mit derselben Config neu auf, nur startScore geändert. Danach (nach
  // dem ersten Wurf) nicht mehr möglich, sonst würden laufende Reste keinen Sinn mehr ergeben.
  const setStartScore=(v)=>{const m=structuredClone(match);m.game=createGame({...match.game.config,startScore:v});onUpdate(m);};

  const isReady=match.t1!==null&&match.t2!==null;

  // Dart-by-dart helpers — dartValue/dartLabel aus der Engine (src/types.js), nur die lokale
  // Feldbenennung ({field,multi}) statt {field,multiplier} bleibt UI-eigen.
  const dv=(d)=>dartValue(d.field,d.multi);
  const dl=(d)=>dartLabel(d.field,d.multi);
  const dTotal=darts.reduce((s,d)=>s+dv(d),0);
  const addDart=(f,multi)=>{if(darts.length>=3)return;setDarts([...darts,{field:f,multi}]);};

  // Parst "T20"/"D25"/"0" usw. aus dem manuellen Text-Feld — auch mehrere auf
  // einmal, komma-/leerzeichengetrennt ("T20, S5, T2"), da User intuitiv gleich
  // die ganze Aufnahme eintippen. Alles-oder-nichts: ein ungültiges Token lehnt
  // den gesamten Eintrag ab, statt nur einen Teil der Darts stumm zu übernehmen.
  // Baut die neuen Darts direkt per setDarts zusammen statt addDart() in einer
  // Schleife aufzurufen — addDart liest darts.length aus dem Closure, mehrere
  // Aufrufe in derselben Funktion würden sich sonst gegenseitig überschreiben
  // statt zu addieren (React batcht setState, jeder Aufruf sähe denselben alten
  // darts-Stand).
  const parseDartToken=(tok)=>{
    if(tok==="0")return{field:0,multi:"S"};
    const match=tok.match(/^([SDT])(\d{1,2})$/);
    const field=match?Number(match[2]):NaN;
    const multi=match?match[1]:null;
    if(!match||!isValidDart(field,multi))return null;
    return{field,multi};
  };
  const submitDartInput=()=>{
    const raw=dartInput.trim().toUpperCase();
    if(!raw)return;
    const tokens=raw.split(/[,\s]+/).filter(Boolean);
    const fail=()=>{setDartInputError(true);setTimeout(()=>setDartInputError(false),600);};
    if(darts.length+tokens.length>3){fail();return;}
    const parsed=tokens.map(parseDartToken);
    if(parsed.some(d=>d===null)){fail();return;}
    setDarts([...darts,...parsed]);
    setDartInput("");
  };

  // ── TV VIEW ──
  if(isTV){
    const turnPlayer=match.game.currentPlayer+1;
    const sides=[{p:1,name:t1,rem:match.game.scores[0],s:match.game.legs[0],co:co1},{p:2,name:t2,rem:match.game.scores[1],s:match.game.legs[1],co:co2}];
    return(
      <div style={{minHeight:"100vh",background:bg,color:textHi,fontFamily:F,display:"flex",flexDirection:"column",overflow:"hidden",position:"relative"}}>
        {bustMsg&&<div style={{position:"fixed",inset:0,background:`oklch(14% 0.05 20)`,zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",animation:"tv-bust 1.2s ease-out forwards",pointerEvents:"none"}}>
          <div style={{fontFamily:FD,fontSize:"20vw",fontWeight:800,color:colRed,letterSpacing:"-0.02em"}}>{bustMsg}</div>
        </div>}

        {match.winner!==null&&<div style={{position:"fixed",inset:0,background:greenDark,zIndex:50,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",animation:"tv-winner 0.5s ease-out forwards"}}>
          <div className="label-upper" style={{fontSize:"min(18px,1.8vw)",color:greenText,letterSpacing:"0.14em",marginBottom:"3vh"}}>SIEGER</div>
          <div style={{fontFamily:FD,fontSize:"min(120px,11vw)",fontWeight:800,color:textHi,lineHeight:0.92,letterSpacing:"-0.02em",textAlign:"center",padding:"0 6vw"}}>{teams[match.winner]}</div>
          <div style={{fontFamily:FD,fontSize:"min(48px,4.5vw)",fontWeight:700,color:green,marginTop:"3vh"}}>gewinnt!</div>
        </div>}

        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 40px",borderBottom:`1px solid ${bdrSoft}`,flexShrink:0}}>
          <div className="label-upper" style={{fontSize:13,color:textLow,letterSpacing:"0.08em"}}>{roundName}</div>
          <div className="label-upper" style={{fontSize:11,padding:"4px 16px",background:isDoubleOut?orangeDark:greenDark,color:isDoubleOut?orange:green,borderRadius:4}}>{isDoubleOut?"DOUBLE OUT":"SINGLE OUT"}</div>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div className="label-upper" style={{fontSize:13,color:textLow,marginRight:8}}>LEG {curLeg}</div>
            {tvControls}
            <button onClick={()=>window.close()} aria-label="Schließen" style={{background:"none",border:`1px solid ${bdrSoft}`,borderRadius:6,color:textOff,fontSize:16,padding:"2px 10px",cursor:"pointer",fontFamily:F,lineHeight:1}}>✕</button>
          </div>
        </div>

        <div style={{flex:1,display:"flex",position:"relative"}}>
          <div style={{position:"absolute",top:0,bottom:0,left:"50%",width:1,background:bdrSoft,transform:"translateX(-50%)",pointerEvents:"none"}}/>
          {sides.map(({p,name,rem:r,s,co})=>{
            const active=turnPlayer===p;
            return(
              <div key={p} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"5vh 6vw",background:active?card:bg,borderTop:`4px solid ${active?green:bdrSoft}`,transition:"background 400ms ease,border-color 400ms ease",position:"relative"}}>
                <div style={{display:"flex",gap:16,marginBottom:"5vh"}}>
                  {[0,1].map(i=><div key={i} style={{width:30,height:30,borderRadius:"50%",background:i<s?green:bdr,border:`3px solid ${i<s?green:textOff}`,transition:"background 300ms ease"}}/>)}
                </div>
                <div className="label-upper" style={{fontSize:"min(28px,2.6vw)",fontWeight:600,color:active?textHi:textMid,letterSpacing:"0.04em",marginBottom:"3vh",textAlign:"center",maxWidth:"100%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{name}</div>
                <div className="score-num" aria-live="polite" aria-label={`Rest: ${r}`} style={{fontSize:"min(260px,24vw)",fontWeight:800,color:active?green:textHi,lineHeight:0.9,letterSpacing:"-0.02em"}}>{r}</div>
                {active&&<div className="label-upper" style={{marginTop:"4vh",fontSize:"min(16px,1.4vw)",color:green,letterSpacing:"0.14em"}}>▶ AM WURF</div>}
                {co&&r<=170&&r>1&&<div style={{position:"absolute",bottom:0,left:0,right:0,padding:"18px 40px 24px",background:orangeDark,borderTop:`2px solid ${orange}`,textAlign:"center"}}>
                  <div className="label-upper" style={{fontSize:"min(12px,1.1vw)",color:orange,letterSpacing:"0.1em",marginBottom:8}}>CHECKOUT</div>
                  <div style={{fontFamily:FD,fontSize:"min(44px,4vw)",fontWeight:800,color:textHi}}>{co}</div>
                </div>}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── STARTER SELECTION ──
  if(showStarter&&isReady)return(
    <div style={{minHeight:"100vh",background:bg,color:textHi,fontFamily:F,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:20}}>
      <div role="group" aria-label="Spiellänge" style={{display:"flex",gap:6,marginBottom:24,width:"100%",maxWidth:300}}>
        {[301,501].map(v=><button key={v} onClick={()=>setStartScore(v)} aria-pressed={match.game.config.startScore===v} style={{flex:1,padding:"8px 0",borderRadius:6,background:match.game.config.startScore===v?green:surf2,border:`1px solid ${match.game.config.startScore===v?green:bdr}`,color:match.game.config.startScore===v?bg:textMid,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:F}}>{v}</button>)}
      </div>
      <div style={{fontSize:14,color:textLow,marginBottom:20}}>Wer beginnt?</div>
      {[{p:1,n:t1},{p:2,n:t2}].map(({p,n})=><button key={p} onClick={()=>selectStarter(p)} style={{width:"100%",maxWidth:300,padding:"20px 0",marginBottom:12,background:greenDark,border:`1px solid ${greenBdr}`,borderRadius:10,color:green,fontSize:18,fontWeight:700,cursor:"pointer",fontFamily:F}}>{n}</button>)}
      <button onClick={()=>selectStarter(Math.random()<0.5?1:2)} style={{marginTop:8,padding:"12px 24px",background:colBlueDk,border:`1px solid ${colBlue}`,borderRadius:8,color:colBlue,fontSize:13,cursor:"pointer",fontFamily:F}}>🎲 Zufällig</button>
    </div>
  );

  if(!isReady)return<div style={{minHeight:"100vh",background:bg,color:textOff,fontFamily:F,display:"flex",alignItems:"center",justifyContent:"center"}}>Warte auf vorherige Runde...</div>;

  if(match.winner!==null)return(
    <div style={{minHeight:"100vh",background:bg,color:textHi,fontFamily:F,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:10,padding:20}}>
      <div style={{fontSize:48}}>🏆</div>
      <div style={{fontFamily:FD,fontSize:22,fontWeight:800,color:green,letterSpacing:"-0.01em"}}>{teams[match.winner]} gewinnt!</div>
      <div className="score-num" style={{fontSize:14,color:textLow,marginTop:2}}>{match.game.legs[0]} : {match.game.legs[1]}</div>
      <div style={{display:"flex",gap:10,marginTop:16}}>
        <button onClick={onBack} style={{padding:"10px 20px",background:greenDark,border:`1px solid ${greenBdr}`,borderRadius:8,color:greenText,fontSize:13,cursor:"pointer",fontFamily:F}}>Zurück</button>
        <button onClick={undoLeg} style={{padding:"10px 20px",background:colRedDk,border:`1px solid ${colRed}`,borderRadius:8,color:colRed,fontSize:12,cursor:"pointer",fontFamily:F}}>↩ Leg zurück</button>
      </div>
    </div>
  );

  // ── GRIDS ──
  const renderGrid=(from,to)=>{const nums=[];for(let i=from;i<=to;i++)if(!IMPOSSIBLE_TOTALS.has(i))nums.push(i);
    return<div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:5,padding:"6px 8px",overflowY:"auto",flex:1}}>{nums.map(n=>{const dis=n>rem||(isDoubleOut&&(rem-n)===1);const c=COMMON.has(n);return<button key={n} onClick={()=>!dis&&addScore(n)} aria-disabled={dis?"true":undefined} style={{background:dis?bg:c?greenDark:surf2,border:`1px solid ${dis?bdrSoft:c?greenBdr:bdr}`,color:dis?textOff:c?green:textMid,borderRadius:6,padding:"10px 0",fontSize:14,fontWeight:c?700:400,cursor:dis?"default":"pointer",fontFamily:F}}>{n}</button>})}</div>;};

  const renderFavs=()=><div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,padding:"10px",flex:1,alignContent:"start"}}>{FAVORITES.map(n=>{const dis=n>rem||(isDoubleOut&&(rem-n)===1);return<button key={n} onClick={()=>!dis&&addScore(n)} aria-disabled={dis?"true":undefined} style={{background:dis?bg:n===180?colRedDk:n===0?colBlueDk:greenDark,border:`1px solid ${dis?bdrSoft:n===180?colRed:n===0?colBlue:greenBdr}`,color:dis?textOff:n===180?colRed:n===0?colBlue:green,borderRadius:10,padding:"18px 0",fontSize:22,fontWeight:800,cursor:dis?"default":"pointer",fontFamily:F}}>{n}</button>})}</div>;

  const renderNumpad=()=>{const proj=npad?rem-Number(npad):null;return<div style={{padding:"6px 10px",flex:1,display:"flex",flexDirection:"column"}}><div className="score-num" style={{textAlign:"center",padding:"4px 0",fontSize:32,fontWeight:700,color:npad?textHi:textOff,minHeight:44}}>{npad||"0"}</div><div style={{textAlign:"center",fontSize:11,minHeight:18,color:proj===null?textOff:proj<0||proj===1&&isDoubleOut?colRed:proj===0?green:textMid,marginBottom:4}}>{proj===null?"Rest eingeben":proj<0||(proj===1&&isDoubleOut)?"BUST":proj===0?"Checkout!":` → Rest: ${proj}`}</div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,flex:1}}>{[1,2,3,4,5,6,7,8,9].map(d=><button key={d} onClick={()=>npad.length<3&&setNpad(npad+d)} style={{background:surf2,border:`1px solid ${bdr}`,borderRadius:8,padding:"12px 0",fontSize:20,color:textHi,cursor:"pointer",fontFamily:F,fontWeight:600}}>{d}</button>)}<button onClick={()=>setNpad("")} style={{background:surf2,border:`1px solid ${bdr}`,borderRadius:8,padding:"12px 0",fontSize:13,color:textLow,cursor:"pointer",fontFamily:F}}>C</button><button onClick={()=>npad.length<3&&setNpad(npad+"0")} style={{background:surf2,border:`1px solid ${bdr}`,borderRadius:8,padding:"12px 0",fontSize:20,color:textHi,cursor:"pointer",fontFamily:F,fontWeight:600}}>0</button><button onClick={()=>{if(npad){addScore(Number(npad));setNpad("");}}} style={{background:npad?green:surf2,border:`1px solid ${npad?green:bdr}`,borderRadius:8,padding:"12px 0",fontSize:14,color:npad?bg:textOff,cursor:npad?"pointer":"default",fontFamily:F,fontWeight:700}}>OK</button></div></div>;}

  const renderDarts=()=>{
    const mc={S:textMid,D:green,T:colRed};
    const colA=[20,18,16,14,12,10,8,6,4,2];
    const colB=[19,17,15,13,11,9,7,5,3,1];
    const dis3=darts.length>=3;
    const cell=(field,multi,label)=><button key={multi} onClick={()=>addDart(field,multi)} aria-disabled={dis3?"true":undefined} aria-label={field===25?(multi==="D"?"Bullseye":"Single Bull"):`${multi==="S"?"Single":multi==="D"?"Double":"Triple"} ${field}`} style={{background:dis3?bg:surf2,border:`1px solid ${dis3?bdrSoft:bdr}`,borderRadius:6,padding:"6px 0",color:dis3?textOff:mc[multi],fontSize:14,fontWeight:600,cursor:dis3?"default":"pointer",fontFamily:F}}>{label}</button>;
    const halfHeader=<div style={{display:"grid",gridTemplateColumns:"20px 1fr 1fr 1fr",gap:3,padding:"0 0 3px"}}>
      <div/>
      {["S","D","T"].map(m=><div key={m} style={{textAlign:"center",fontSize:10,fontWeight:700,color:mc[m],letterSpacing:"0.05em"}}>{m}</div>)}
    </div>;
    const renderCol=(list)=><div style={{display:"flex",flexDirection:"column",gap:3,flex:1}}>
      {halfHeader}
      {list.map(f=><div key={f} style={{display:"grid",gridTemplateColumns:"20px 1fr 1fr 1fr",gap:3,alignItems:"center"}}>
        <div style={{fontSize:10,color:textLow,textAlign:"right",paddingRight:2}}>{f}</div>
        {cell(f,"S",f)}
        {cell(f,"D",f*2)}
        {cell(f,"T",f*3)}
      </div>)}
    </div>;
    return<div style={{padding:"6px 8px",flex:1,display:"flex",flexDirection:"column"}}>
      <div style={{display:"flex",gap:6,justifyContent:"center",padding:"6px 0",minHeight:42}}>
        {[0,1,2].map(i=><div key={i} style={{width:70,padding:"6px 0",borderRadius:8,textAlign:"center",background:darts[i]?greenDark:card,border:`1px solid ${darts[i]?greenBdr:bdr}`}}>{darts[i]?<><div style={{fontSize:14,fontWeight:700,color:mc[darts[i].multi]}}>{dl(darts[i])}</div><div style={{fontSize:9,color:textLow}}>{dv(darts[i])}</div></>:<div style={{fontSize:11,color:textOff}}>Dart {i+1}</div>}</div>)}
        {darts.length>0&&<div style={{alignSelf:"center",padding:"6px 10px",background:colBlueDk,borderRadius:8,border:`1px solid ${colBlue}`}}><div className="score-num" style={{fontSize:18,fontWeight:700,color:textHi}}>{dTotal}</div></div>}
      </div>
      <div className="darts-cols">
        {renderCol(colA)}
        {renderCol(colB)}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"20px 1fr 1fr 1fr",gap:3,alignItems:"center",marginTop:4}}>
        <div style={{fontSize:9,color:textLow,textAlign:"right",paddingRight:2}}>Bull</div>
        {cell(25,"S",25)}
        {cell(25,"D",50)}
        <div/>
      </div>
      <div style={{display:"flex",gap:6,marginTop:6}}>
        <button onClick={()=>!dis3&&addDart(0,"S")} aria-disabled={dis3?"true":undefined} style={{flex:1,padding:"8px 0",background:dis3?bg:surf2,border:`1px solid ${dis3?bdrSoft:bdr}`,borderRadius:6,color:dis3?textOff:textLow,fontSize:12,fontWeight:600,cursor:dis3?"default":"pointer",fontFamily:F}}>Miss</button>
        <button onClick={()=>!dis3&&setDarts([...darts,...Array(3-darts.length).fill({field:0,multi:"S"})])} aria-disabled={dis3?"true":undefined} title="Restliche Darts dieser Aufnahme als Miss eintragen" style={{flex:1,padding:"8px 0",background:dis3?bg:surf2,border:`1px solid ${dis3?bdrSoft:bdr}`,borderRadius:6,color:dis3?textOff:colRed,fontSize:12,fontWeight:600,cursor:dis3?"default":"pointer",fontFamily:F}}>Rest Miss</button>
      </div>
      {/* Manuelle Text-Eingabe (T20, D25, 0...) ausgebaut — parseDartToken/submitDartInput
          bleiben oben definiert, falls sie später zurückkommen soll. */}
      <div style={{display:"flex",gap:6,padding:"4px 0"}}>
        <button onClick={()=>darts.length&&setDarts(darts.slice(0,-1))} disabled={!darts.length} aria-label="Letzten Dart entfernen" title="Letzten Dart entfernen" style={{flex:1,padding:"0",background:surf2,border:`1px solid ${bdr}`,borderRadius:8,color:darts.length?orange:textOff,fontSize:12,fontWeight:600,fontFamily:F,whiteSpace:"nowrap"}}>Dart ↩</button>
        <button onClick={()=>{if(darts.length){addDarts(darts);setDarts([]);}}} style={{flex:2,padding:"10px 0",background:darts.length?green:surf2,border:`1px solid ${darts.length?green:bdr}`,borderRadius:8,color:darts.length?bg:textOff,fontSize:14,fontWeight:700,cursor:darts.length?"pointer":"default",fontFamily:F}}>{darts.length?`${dTotal} eintragen`:"Darts eingeben"}</button>
      </div>
    </div>;};

  // Wurfhistorie: alle Aufnahmen des Spiels, neueste zuerst — Einzeldarts wenn über den
  // Darts-Tab eingegeben, sonst nur die Summe (Numpad/Zahl/Favoriten kennen keine Einzeldarts).
  const renderHistory=()=>{
    const entries=[...fullMatchHistory(match.game)].reverse();
    if(!entries.length)return<div style={{textAlign:"center",color:textOff,fontSize:12,padding:"40px 20px"}}>Noch keine Aufnahmen in diesem Spiel.</div>;
    return<div style={{padding:"6px 8px",flex:1,display:"flex",flexDirection:"column",gap:6,overflowY:"auto"}}>
      {entries.map((t,i)=>{
        const name=t.player===0?t1:t2;
        const detail=t.darts?t.darts.map(d=>dartLabel(d.field,d.multiplier)).join(" · "):`${t.score} Punkte`;
        return<div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 10px",background:card,border:`1px solid ${t.isBust?colRed:bdr}`,borderRadius:8}}>
          <div style={{display:"flex",flexDirection:"column",gap:2}}>
            <span style={{fontSize:9,color:textOff}}>Leg {t.leg} · {name}</span>
            <span style={{fontSize:13,color:t.isBust?colRed:textHi,fontWeight:600}}>{detail}</span>
          </div>
          <span className="score-num" style={{fontSize:14,fontWeight:700,color:t.isBust?colRed:green}}>{t.isBust?"BUST":t.score}</span>
        </div>;
      })}
    </div>;
  };

  const sides=[{p:1,name:t1,r:match.game.scores[0],h:legHistory(match.game,0),s:match.game.legs[0],co:co1},{p:2,name:t2,r:match.game.scores[1],h:legHistory(match.game,1),s:match.game.legs[1],co:co2}];

  return(
    <div style={{minHeight:"100vh",background:bg,color:textHi,fontFamily:F,display:"flex",flexDirection:"column",maxWidth:420,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",padding:"10px 12px",borderBottom:`1px solid ${bdrSoft}`}}>
        <button onClick={onBack} aria-label="Zurück" style={{background:"none",border:"none",color:textLow,fontSize:20,cursor:"pointer",padding:"0 12px 0 0"}}>←</button>
        <div style={{flex:1}}><span style={{fontSize:12,color:textMid}}>{roundName}</span><span style={{marginLeft:6,fontSize:9,padding:"2px 5px",background:isDoubleOut?orangeDark:greenDark,color:isDoubleOut?orange:green,borderRadius:4}}>{isDoubleOut?"DO":"SO"}</span></div>
        <span style={{fontSize:11,color:textLow,marginRight:6}}>Leg {curLeg}</span>
        <button onClick={undoThrow} aria-label="Letzte Aufnahme zurücknehmen" title="Letzte Aufnahme zurücknehmen" style={{background:surf2,border:`1px solid ${bdr}`,borderRadius:6,color:orange,fontSize:12,fontWeight:600,padding:"0 10px",cursor:"pointer",fontFamily:F,marginRight:4,whiteSpace:"nowrap"}}>Wurf ↩</button>
        {match.game.legResults.length>0&&<button onClick={undoLeg} aria-label="Letztes Leg zurücknehmen" title="Letztes Leg zurücknehmen" style={{background:surf2,border:`1px solid ${bdr}`,borderRadius:6,color:colRed,fontSize:11,fontWeight:600,padding:"0 10px",cursor:"pointer",fontFamily:F,whiteSpace:"nowrap"}}>Leg ↩</button>}
      </div>
      <div style={{display:"flex",gap:8,padding:"8px 10px"}}>
        {sides.map(({p,name,r,h,s,co})=><div key={p} aria-label={`${name}, Rest: ${r}`} style={{flex:1,padding:"8px 6px",borderRadius:10,background:ap===p?greenDark:card,border:`2px solid ${ap===p?green:bdr}`,display:"flex",flexDirection:"column",width:"100%"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:11,color:ap===p?greenText:textLow,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:80}}>{name}</span><div style={{display:"flex",alignItems:"center",gap:4}}><span className="score-num" style={{fontSize:11,color:ap===p?greenText:textLow,fontWeight:700}}>{s}</span><div style={{display:"flex",gap:2}}>{[0,1].map(i=><div key={i} style={{width:8,height:8,borderRadius:"50%",background:i<s?green:bdr,border:`1px solid ${i<s?green:textOff}`}}/>)}</div></div></div>
          <div className="score-num" style={{fontSize:36,fontWeight:800,textAlign:"center",color:r===0?green:textHi,lineHeight:1.1}}>{r}</div>
          {co&&r<=170&&r>1&&<div style={{fontSize:9,color:orange,textAlign:"center",marginTop:2}}>{co}</div>}
          <div style={{fontSize:9,color:textOff,textAlign:"center",marginTop:3,height:14,overflow:"hidden"}}>{h.slice(-5).join("·")}</div>
        </div>)}
      </div>
      {bustMsg&&<div aria-live="assertive" style={{textAlign:"center",padding:"4px 0",color:colRed,fontSize:18,fontWeight:800}}>{bustMsg}</div>}
      <div style={{borderBottom:`1px solid ${bdrSoft}`}}>
        {/* Favoriten/Numpad/Zahl-Tabs (ids 0-4) ausgebaut — nur noch Darts+Verlauf im UI.
            renderFavs/renderNumpad/renderGrid bleiben unten definiert, falls die Tabs
            später zurückkommen sollen. */}
        <div role="tablist" style={{display:"flex",padding:"0 8px"}}>
          {[{id:5,l:"Darts"},{id:6,l:"Verlauf"}].map(t=><button key={t.id} id={`tab-${t.id}`} role="tab" aria-selected={tab===t.id} aria-controls="scoring-tabpanel" onClick={()=>setTab(t.id)} style={{flex:1,padding:"6px 0",fontSize:11,background:"transparent",border:"none",borderBottom:tab===t.id?`2px solid ${green}`:"2px solid transparent",color:tab===t.id?green:textLow,cursor:"pointer",fontFamily:F,fontWeight:tab===t.id?700:400}}>{t.l}</button>)}
        </div>
      </div>
      <div id="scoring-tabpanel" role="tabpanel" aria-labelledby={`tab-${tab}`} style={{flex:1,display:"flex",flexDirection:"column",minHeight:250,overflowY:"auto"}}>
        {tab===5&&renderDarts()}{tab===6&&renderHistory()}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// STATS VIEW
// ═══════════════════════════════════════════
function StatsView({bracket,onBack}){
  const stats=useMemo(()=>computeStats(bracket),[bracket]);
  const best=stats[0];
  return(
    <div style={{minHeight:"100vh",background:bg,color:textHi,fontFamily:F,padding:"16px 12px"}}>
      <div style={{display:"flex",alignItems:"center",marginBottom:16}}><button onClick={onBack} aria-label="Zurück" style={{background:"none",border:"none",color:textLow,fontSize:20,cursor:"pointer",padding:"0 12px 0 0"}}>←</button><h2 style={{fontSize:14,fontWeight:700,margin:0}}>Statistiken</h2></div>
      {best&&best.totalThrows>0&&<div style={{textAlign:"center",padding:"14px",marginBottom:14,background:greenDark,border:`1px solid ${greenBdr}`,borderRadius:12}}><div className="label-upper" style={{fontSize:10,color:greenText}}>BESTES TEAM (Ø)</div><div style={{fontFamily:FD,fontSize:20,fontWeight:800,marginTop:4}}>{best.name}</div><div style={{fontSize:13,color:green,marginTop:2}}>Ø {best.avg} pro Aufnahme</div></div>}
      {stats.filter(s=>s.totalThrows>0||s.matchesWon>0).map((s,i)=><div key={i} style={{background:card,border:`1px solid ${bdr}`,borderRadius:10,padding:"12px 14px",marginBottom:8}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{fontFamily:FD,fontSize:14,fontWeight:700,color:textHi}}>{s.name}</span><span className="score-num" style={{fontSize:12,color:green}}>{s.totalThrows>0?`Ø ${s.avg}`:"—"}</span></div>
        <div style={{display:"flex",gap:10,flexWrap:"wrap",fontSize:11,color:textLow}}><span>Wrf {s.totalThrows}</span><span>Sieg {s.matchesWon}</span><span>Legs {s.legs}</span><span style={{color:s.ton80>0?colRed:textLow}}>180: {s.ton80}x</span><span style={{color:s.ton40>0?orange:textLow}}>140+: {s.ton40}x</span><span style={{color:s.ton>0?greenText:textLow}}>100+: {s.ton}x</span><span>Hi: {s.highest||"—"}</span></div>
      </div>)}
      {stats.every(s=>s.totalThrows===0&&s.matchesWon===0)&&<div style={{textAlign:"center",color:textOff,fontSize:12,padding:"40px 20px"}}>Noch keine Würfe erfasst — Statistiken erscheinen, sobald das erste Match läuft.</div>}
    </div>
  );
}

// ═══════════════════════════════════════════
// SETTINGS VIEW (Sounds)
// ═══════════════════════════════════════════
function SettingsView({sounds,onSave,onBack}){
  const[s,setS]=useState({...sounds});
  return(
    <div style={{minHeight:"100vh",background:bg,color:textHi,fontFamily:F,padding:"16px 12px"}}>
      <div style={{display:"flex",alignItems:"center",marginBottom:16}}><button onClick={onBack} aria-label="Zurück" style={{background:"none",border:"none",color:textLow,fontSize:20,cursor:"pointer",padding:"0 12px 0 0"}}>←</button><h2 style={{fontSize:14,fontWeight:700,margin:0}}>Sounds</h2></div>
      <p style={{fontSize:11,color:textLow,marginBottom:14}}>MP3/WAV-URL pro Event. Leer = Synth-Fallback.</p>
      {SOUND_EVENTS.map(e=><div key={e.key} style={{marginBottom:10}}>
        <label htmlFor={`snd-${e.key}`} style={{fontSize:11,color:textLow,display:"block",marginBottom:3}}>{e.label}</label>
        <div style={{display:"flex",gap:6}}>
          <input id={`snd-${e.key}`} value={s[e.key]||""} onChange={ev=>{const n={...s};n[e.key]=ev.target.value;setS(n);}} placeholder="https://..." style={{flex:1,background:surf2,border:`1px solid ${bdr}`,borderRadius:6,padding:"8px 10px",color:textHi,fontFamily:F,fontSize:12}}/>
          <button onClick={()=>{const url=s[e.key];if(url)playCustomUrl(url);else playFallback(e.key);}} aria-label={`${e.label} testen`} style={{background:surf2,border:`1px solid ${bdr}`,borderRadius:6,padding:"8px 12px",color:green,fontSize:12,cursor:"pointer",fontFamily:F}}>▶</button>
        </div>
      </div>)}
      <button onClick={()=>{customSounds={...s};onSave(s);onBack();}} style={{width:"100%",marginTop:12,padding:"12px 0",background:green,color:bg,border:"none",borderRadius:8,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:F}}>Speichern</button>
    </div>
  );
}

// ═══════════════════════════════════════════
// MODAL (shared dialog shell: role=dialog, Escape, Focus-Trap, Focus-Return)
// ═══════════════════════════════════════════
function Modal({titleId,onClose,maxWidth=380,accent,children}){
  const boxRef=useRef(null);
  useEffect(()=>{
    const prevFocus=document.activeElement;
    const focusables=()=>boxRef.current?boxRef.current.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'):[];
    focusables()[0]?.focus();
    const onKey=(e)=>{
      if(e.key==="Escape"){onClose();return;}
      if(e.key!=="Tab")return;
      const f=[...focusables()];
      if(!f.length)return;
      const first=f[0],last=f[f.length-1];
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
    };
    document.addEventListener("keydown",onKey);
    return()=>{document.removeEventListener("keydown",onKey);prevFocus instanceof HTMLElement&&prevFocus.focus();};
  },[]);
  return(
    <div style={{position:"fixed",inset:0,background:"oklch(0% 0 0 / 0.72)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={onClose}>
      <div ref={boxRef} role="dialog" aria-modal="true" aria-labelledby={titleId} style={{background:card,border:`1px solid ${accent||bdrSoft}`,borderRadius:14,padding:"20px 24px",maxWidth,width:"100%",maxHeight:"85vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

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

// ═══════════════════════════════════════════
// HELP MODAL
// ═══════════════════════════════════════════
function HelpModal({onClose}){
  return(
    <Modal titleId="help-title" onClose={onClose} maxWidth={340}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <h2 id="help-title" style={{fontSize:14,fontWeight:700,color:textHi,fontFamily:F,margin:0}}>Hilfe</h2>
          <button onClick={onClose} aria-label="Schließen" style={{background:"none",border:"none",color:textLow,fontSize:22,cursor:"pointer",lineHeight:1,padding:"0 0 0 16px"}}>×</button>
        </div>
        <div style={{fontSize:11,color:textLow,lineHeight:1.9,fontFamily:F}}>
          <div style={{color:textMid,fontWeight:600,marginBottom:2,fontSize:10,letterSpacing:"0.06em"}}>SCORING-TABS</div>
          <div><span style={{color:greenText}}>Darts</span> — Einzeldarts: Feld + S/D/T auswählen</div>
          <div><span style={{color:greenText}}>Verlauf</span> — alle Aufnahmen des Spiels</div>
          <div style={{marginTop:12,color:textMid,fontWeight:600,marginBottom:2,fontSize:10,letterSpacing:"0.06em"}}>SPIELMODUS</div>
          <div><span style={{color:green}}>Single Out</span> — letzter Dart darf auf alles</div>
          <div><span style={{color:orange}}>Double Out</span> — letzter Dart muss Double oder Bull sein</div>
          <div style={{marginTop:12,color:textMid,fontWeight:600,marginBottom:2,fontSize:10,letterSpacing:"0.06em"}}>AKTIONEN</div>
          <div><span style={{color:colRed}}>BUST</span> — Überwurf, Rest bleibt unverändert</div>
          <div>↩ — letzten Einzelwurf zurücknehmen</div>
          <div>↩L — letztes Leg komplett zurücksetzen</div>
          <div style={{marginTop:12,color:textOff}}>Fortschritt wird automatisch gespeichert.</div>
        </div>
    </Modal>
  );
}

// ═══════════════════════════════════════════
// MATCH CARD
// ═══════════════════════════════════════════
function MatchCard({match,teams,onOpen}){
  const t1=match.t1!==null?teams[match.t1]:"—";const t2=match.t2!==null?teams[match.t2]:"—";
  const done=match.winner!==null;const ready=match.t1!==null&&match.t2!==null;
  const freilos=done&&!ready;
  return<div>
    <button onClick={()=>onOpen(match.id)} disabled={!ready} style={{width:"100%",display:"block",textAlign:"left",background:done?greenDark:card,border:`1px solid ${done?greenBdr:bdr}`,borderRadius:10,padding:"10px 14px",minWidth:170,color:"inherit"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}><span style={{color:match.winner===match.t1?green:textMid,fontSize:13,fontWeight:match.winner===match.t1?700:400,fontFamily:F,maxWidth:110,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t1}</span><span style={{color:textLow,fontSize:14,fontFamily:F,fontWeight:700}}>{match.game.legs[0]}</span></div>
      <div style={{height:1,background:bdr}}/>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:5}}><span style={{color:match.winner===match.t2?green:textMid,fontSize:13,fontWeight:match.winner===match.t2?700:400,fontFamily:F,maxWidth:110,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t2}</span><span style={{color:textLow,fontSize:14,fontFamily:F,fontWeight:700}}>{match.game.legs[1]}</span></div>
      {ready&&!done&&<div style={{textAlign:"center",marginTop:6,fontSize:10,color:green}}>▶ Spielen</div>}
      {freilos&&<div style={{textAlign:"center",marginTop:6,fontSize:10,color:textOff}}>Freilos — steigt kampflos auf</div>}
      {match.isThirdPlace&&<div style={{textAlign:"center",marginTop:4,fontSize:9,color:orange}}>🥉 Platz 3</div>}
    </button>
  </div>;
}

// ═══════════════════════════════════════════
// GROUP OVERVIEW (Gruppenphase-Screen: Tabellen + Spielliste)
// ═══════════════════════════════════════════
function GroupOverview({groupPhase,config,onOpen,onStartKo,onTvOverview,onShowHelp,onReset,theme,toggleTheme,tvBlocked,onDismissTvBlocked,saveError,onDismissSaveError}){
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

      {saveError&&<div style={{background:colRedDk,border:`1px solid ${colRed}`,borderRadius:8,padding:"8px 14px",fontSize:11,color:colRed,display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
        <span>Automatisches Speichern fehlgeschlagen — Fortschritt könnte bei einem Neuladen verloren gehen.</span>
        <button onClick={onDismissSaveError} aria-label="Hinweis schließen" style={{background:"none",border:"none",color:colRed,fontSize:14,cursor:"pointer",flexShrink:0}}>✕</button>
      </div>}

      <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
        {renderStandings(table1,"Gruppe 1")}
        {renderStandings(table2,"Gruppe 2")}
      </div>

      <button onClick={onStartKo} disabled={!complete} style={{padding:"14px 0",background:complete?green:surf2,color:complete?bg:textOff,border:"none",borderRadius:8,fontSize:14,fontWeight:700,cursor:complete?"pointer":"default",fontFamily:F}}>{complete?"Weiter zur KO-Phase":"Erst alle Gruppenspiele beenden"}</button>

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
    </div>
  );
}

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
          <div>Jedes Leg startet bei <span style={{color:greenText}}>{config.startScore}</span> Punkten, runtergezählt bis exakt 0.</div>
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

// ═══════════════════════════════════════════
// TV-ÜBERSICHT (dauerhafter Zuschauer-Screen, alle Matches auf einen Blick)
// ═══════════════════════════════════════════
function TvMatchCard({match,teams}){
  const t1=match.t1!==null?teams[match.t1]:"—";
  const t2=match.t2!==null?teams[match.t2]:"—";
  const done=match.winner!==null;
  const ready=match.t1!==null&&match.t2!==null;
  const started=ready&&(match.started||match.game.turns.length>0||match.game.legResults.length>0);
  const bye=!ready&&done;
  return(
    <div style={{background:done?greenDark:started?surf2:card,border:`1px solid ${done?greenBdr:started?green:bdr}`,borderRadius:10,padding:"10px 14px",position:"relative"}}>
      {started&&!done&&<div style={{position:"absolute",top:8,right:10,fontSize:9,color:green,display:"flex",alignItems:"center",gap:4}}><span style={{width:6,height:6,borderRadius:"50%",background:green,display:"inline-block"}}/>LIVE</div>}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
        <span style={{color:match.winner===match.t1?green:textHi,fontSize:16,fontWeight:match.winner===match.t1?800:600,maxWidth:150,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t1}</span>
        <span className="score-num" style={{color:textHi,fontSize:started?22:16,fontWeight:800}}>{started&&!done?match.game.scores[0]:match.game.legs[0]}</span>
      </div>
      <div style={{height:1,background:bdr}}/>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:6}}>
        <span style={{color:match.winner===match.t2?green:textHi,fontSize:16,fontWeight:match.winner===match.t2?800:600,maxWidth:150,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t2}</span>
        <span className="score-num" style={{color:textHi,fontSize:started?22:16,fontWeight:800}}>{started&&!done?match.game.scores[1]:match.game.legs[1]}</span>
      </div>
      {started&&!done&&<div style={{textAlign:"center",marginTop:6,fontSize:10,color:textLow}}>Sätze {match.game.legs[0]}:{match.game.legs[1]}</div>}
      {bye&&<div style={{textAlign:"center",marginTop:4,fontSize:9,color:textOff}}>Freilos</div>}
    </div>
  );
}

function TvOverview({bracket}){
  const champion=getChampion(bracket);
  const mainRounds=bracket.rounds.filter(r=>!r.matches[0]?.isThirdPlace);
  const thirdRound=bracket.rounds.find(r=>r.matches[0]?.isThirdPlace);
  // Spaltenbreite schrumpft fließend mit der Rundenzahl statt fest 260px zu bleiben — sonst
  // läuft ein größeres Turnier (4+ Runden) auf schmaleren TVs/Beamern in horizontales Scrollen,
  // das ein Zuschauer ohne Maus/Touch am Screen nicht bedienen kann.
  const totalCols=mainRounds.length+(thirdRound?1:0);
  const colWidth=`clamp(150px, ${Math.max(12,Math.floor(88/totalCols))}vw, 260px)`;
  return(
    <div style={{minHeight:"100vh",background:bg,color:textHi,fontFamily:F,padding:"24px 32px",display:"flex",flexDirection:"column",gap:20,position:"relative"}}>
      <GlobalStyles/>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
        <h2 style={{fontFamily:FD,fontSize:28,fontWeight:800,margin:0}}>{bracket.config.name}</h2>
        {champion?
          <div style={{fontFamily:FD,fontSize:22,fontWeight:800,color:green}}>🏆 {champion} gewinnt!</div>
          :<div style={{fontSize:13,color:textLow}}>{bracket.config.date}</div>}
      </div>
      <div style={{display:"flex",gap:totalCols>4?12:24,overflowX:"auto",flex:1}}>
        {mainRounds.map((round,rIdx)=>(
          <div key={rIdx} style={{display:"flex",flexDirection:"column",gap:14,flex:"1 1 0",minWidth:colWidth}}>
            <div style={{textAlign:"center",paddingBottom:6,borderBottom:`2px solid ${bdrSoft}`,fontSize:16,fontWeight:700,color:round.isDoubleOut?orange:green}}>{round.name}</div>
            <div style={{display:"flex",flexDirection:"column",gap:14,justifyContent:"space-around",flex:1}}>
              {round.matches.map(m=><TvMatchCard key={m.id} match={m} teams={bracket.teams}/>)}
            </div>
          </div>
        ))}
        {thirdRound&&<div style={{display:"flex",flexDirection:"column",gap:14,flex:"1 1 0",minWidth:colWidth}}>
          <div style={{textAlign:"center",paddingBottom:6,borderBottom:`2px solid ${bdrSoft}`,fontSize:16,fontWeight:700,color:colBlue}}>{thirdRound.name}</div>
          <div style={{display:"flex",flexDirection:"column",gap:14,justifyContent:"center",flex:1}}>
            {thirdRound.matches.map(m=><TvMatchCard key={m.id} match={m} teams={bracket.teams}/>)}
          </div>
        </div>}
      </div>
    </div>
  );
}

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
      <div style={{display:"flex",gap:24,flexWrap:"wrap"}}>
        <div style={{flex:1,minWidth:300,display:"flex",flexDirection:"column",gap:14}}>
          <div style={{fontSize:14,fontWeight:700,color:green}}>Gruppe 1</div>
          {groupPhase.group1.map(m=><TvMatchCard key={m.id} match={m} teams={groupPhase.teams}/>)}
        </div>
        <div style={{flex:1,minWidth:300,display:"flex",flexDirection:"column",gap:14}}>
          <div style={{fontSize:14,fontWeight:700,color:green}}>Gruppe 2</div>
          {groupPhase.group2.map(m=><TvMatchCard key={m.id} match={m} teams={groupPhase.teams}/>)}
        </div>
      </div>
    </div>
  );
}

// Ein Screen fürs Publikum: zeigt Bracket- oder Gruppen-Übersicht, springt automatisch ins
// laufende Match (Vollbild) sobald eins startet, und kurz nach Spielende
// (Sieger-Einblendung) wieder zurück zur Übersicht.
function TvAuto({bracket,groupPhase,config,theme,toggleTheme}){
  const[pinnedId,setPinnedId]=useState(null);
  const[showRules,setShowRules]=useState(false);
  const live=bracket?findLiveMatch(bracket):(groupPhase?findLiveGroupMatch(groupPhase):null);

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

// ═══════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════
export default function DartTurnier(){
  const[phase,setPhase]=useState("loading");
  const[config,setConfig]=useState({name:"Dart Turnier",date:"",teamSize:8,finalDoubleOut:true,thirdPlace:true,legsToWin:2,startScore:501});
  const[teamNames,setTeamNames]=useState([]);
  const[showHelp,setShowHelp]=useState(false);
  const[confirmReset,setConfirmReset]=useState(false);
  const[bracket,setBracket]=useState(null);
  const[groupPhase,setGroupPhase]=useState(null);
  const[activeMatchId,setActiveMatchId]=useState(null);
  const[sounds,setSounds]=useState({});
  const[tvBlocked,setTvBlocked]=useState(false);
  const[saveError,setSaveError]=useState(false);
  const[theme,setTheme]=useState(getInitialTheme);

  useEffect(()=>{applyTheme(theme);},[theme]);
  const toggleTheme=()=>setTheme(t=>t==="dark"?"light":"dark");

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

  // Live-update TV window when scorer saves
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

  useEffect(()=>{if(bracket||groupPhase)save({bracket,groupPhase,config,sounds}).then(ok=>setSaveError(!ok));},[bracket,groupPhase,config,sounds]);

  // Browser back button support
  useEffect(()=>{
    if(phase==='loading')return;
    if(!new URLSearchParams(window.location.search).get('tv'))
      history.pushState({phase,activeMatchId},'','#'+phase);
  },[phase,activeMatchId]);
  useEffect(()=>{
    const fn=(e)=>{const s=e.state;if(!s)return;setPhase(s.phase);setActiveMatchId(s.activeMatchId||null);};
    window.addEventListener('popstate',fn);
    return()=>window.removeEventListener('popstate',fn);
  },[]);

  useEffect(()=>{
    if(document.getElementById("dart-fonts"))return;
    const pc1=Object.assign(document.createElement("link"),{rel:"preconnect",href:"https://fonts.googleapis.com"});
    const pc2=Object.assign(document.createElement("link"),{rel:"preconnect",href:"https://fonts.gstatic.com"});
    pc2.crossOrigin="anonymous";
    const css=Object.assign(document.createElement("link"),{id:"dart-fonts",rel:"stylesheet",href:"https://fonts.googleapis.com/css2?family=Funnel+Display:wght@700;800&family=Figtree:wght@400;600;700&display=swap"});
    document.head.append(pc1,pc2,css);
  },[]);

  const updateTeamSize=(size)=>{setConfig(c=>({...c,teamSize:size}));setTeamNames(Array(size).fill(""));};

  const startTournament=()=>{
    const names=shuffle(teamNames.map((n,i)=>n.trim()||`Team ${i+1}`));
    if(config.teamSize===8){
      setBracket(null);setGroupPhase(buildGroups(names,config.startScore));setPhase("groups");
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

  const openMatch=(id)=>{setActiveMatchId(id);setPhase("scoring");};
  const openTvOverview=()=>{
    const u=new URL(window.location.href);u.search='?tv=overview';u.hash='';
    const w=window.open(u.toString(),'dart-tv-overview','noopener');
    setTvBlocked(!w); // Browser hat das Popup unterdrückt — sichtbar melden statt stumm nichts zu tun
  };
  const back=()=>{setActiveMatchId(null);setPhase(bracket?"bracket":"groups");};

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

  const resetTournament=()=>{clear();setBracket(null);setGroupPhase(null);setTeamNames(Array(config.teamSize).fill(""));setConfirmReset(false);setPhase("setup");};

  if(phase==="loading")return<><GlobalStyles/><div style={{minHeight:"100vh",background:bg,color:textLow,fontFamily:F,display:"flex",alignItems:"center",justifyContent:"center"}}>Lade...</div></>;

  // ── SETUP ──
  if(phase==="setup")return(
    <div style={{minHeight:"100vh",background:bg,color:textHi,fontFamily:F,display:"flex",flexDirection:"column",alignItems:"center",padding:"24px 16px",position:"relative"}}>
      <GlobalStyles/>
      <button onClick={toggleTheme} aria-label={theme==="dark"?"Zu Hellmodus wechseln":"Zu Dunkelmodus wechseln"} style={{position:"absolute",top:16,right:16,background:surf2,border:`1px solid ${bdr}`,color:textMid,borderRadius:6,padding:"7px 10px",cursor:"pointer",fontSize:13}}>{theme==="dark"?"☀️":"🌙"}</button>
      <div style={{textAlign:"center",marginBottom:20}}><div style={{fontSize:40,marginBottom:4}}>🎯</div><h1 style={{fontFamily:FD,fontSize:22,fontWeight:800,color:textHi,margin:0,letterSpacing:"-0.01em"}}>Dart Turnier</h1><p style={{fontFamily:F,color:textLow,fontSize:11,margin:"4px 0 0",letterSpacing:"0.05em"}}>SETUP</p></div>

      <div style={{background:card,border:`1px solid ${bdr}`,borderRadius:12,padding:16,width:"100%",maxWidth:340,marginBottom:12}}>
        <label htmlFor="cfg-name" style={{fontSize:10,color:textLow}}>Turniername</label>
        <input id="cfg-name" value={config.name} onChange={e=>setConfig(c=>({...c,name:e.target.value}))} style={{width:"100%",background:surf2,border:`1px solid ${bdr}`,borderRadius:6,padding:"8px 10px",color:textHi,fontFamily:F,fontSize:13,marginBottom:8,boxSizing:"border-box"}}/>
        <label htmlFor="cfg-date" style={{fontSize:10,color:textLow}}>Datum</label>
        <input id="cfg-date" value={config.date} onChange={e=>setConfig(c=>({...c,date:e.target.value}))} placeholder="z.B. 19.09.2026" style={{width:"100%",background:surf2,border:`1px solid ${bdr}`,borderRadius:6,padding:"8px 10px",color:textHi,fontFamily:F,fontSize:13,marginBottom:10,boxSizing:"border-box"}}/>

        <span id="teamanzahl-label" style={{fontSize:10,color:textLow,display:"block",marginBottom:4}}>Teamanzahl</span>
        <div role="group" aria-labelledby="teamanzahl-label" style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
          <button onClick={()=>updateTeamSize(Math.max(2,config.teamSize-1))} disabled={config.teamSize<=2} aria-label="Ein Team weniger" style={{width:44,padding:"8px 0",borderRadius:6,background:surf2,border:`1px solid ${bdr}`,color:textHi,fontSize:18,fontWeight:700,fontFamily:F}}>−</button>
          <span className="score-num" style={{flex:1,textAlign:"center",fontSize:20,fontWeight:800,color:textHi}}>{config.teamSize}</span>
          <button onClick={()=>updateTeamSize(Math.min(12,config.teamSize+1))} disabled={config.teamSize>=12} aria-label="Ein Team mehr" style={{width:44,padding:"8px 0",borderRadius:6,background:surf2,border:`1px solid ${bdr}`,color:textHi,fontSize:18,fontWeight:700,fontFamily:F}}>+</button>
        </div>

        <div style={{display:"flex",gap:10,marginBottom:10}}>
          <button onClick={()=>setConfig(c=>({...c,finalDoubleOut:!c.finalDoubleOut}))} aria-pressed={config.finalDoubleOut} style={{fontSize:11,color:textLow,display:"flex",alignItems:"center",gap:4,cursor:"pointer",background:"none",border:"none",padding:0}}>
            <span aria-hidden="true" style={{width:16,height:16,borderRadius:4,border:`1px solid ${bdr}`,background:config.finalDoubleOut?green:surf2,display:"inline-block",textAlign:"center",lineHeight:"16px",fontSize:10,color:bg}}>{config.finalDoubleOut?"✓":""}</span>
            Finale: Double Out
          </button>
          <button onClick={()=>setConfig(c=>({...c,thirdPlace:!c.thirdPlace}))} aria-pressed={config.thirdPlace} style={{fontSize:11,color:textLow,display:"flex",alignItems:"center",gap:4,cursor:"pointer",background:"none",border:"none",padding:0}}>
            <span aria-hidden="true" style={{width:16,height:16,borderRadius:4,border:`1px solid ${bdr}`,background:config.thirdPlace?green:surf2,display:"inline-block",textAlign:"center",lineHeight:"16px",fontSize:10,color:bg}}>{config.thirdPlace?"✓":""}</span>
            Spiel um Platz 3
          </button>
        </div>

        <div style={{marginBottom:10}}>
          <span style={{fontSize:10,color:textLow,display:"block",marginBottom:4}}>Spiellänge</span>
          <div role="group" aria-label="Spiellänge" style={{display:"flex",gap:6}}>
            {[301,501].map(v=><button key={v} onClick={()=>setConfig(c=>({...c,startScore:v}))} aria-pressed={config.startScore===v} style={{flex:1,padding:"8px 0",borderRadius:6,background:config.startScore===v?green:surf2,border:`1px solid ${config.startScore===v?green:bdr}`,color:config.startScore===v?bg:textMid,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:F}}>{v}</button>)}
          </div>
        </div>
      </div>

      <div style={{background:card,border:`1px solid ${bdr}`,borderRadius:12,padding:16,width:"100%",maxWidth:340,marginBottom:12}}>
        <p style={{color:textLow,fontSize:10,margin:"0 0 8px"}}>{config.teamSize} Teams · je 2 Spieler · {teamNames.filter(n=>n.trim()).length} benannt (Rest wird "Team N")</p>
        <div style={{maxHeight:240,overflowY:"auto",border:`1px solid ${bdrSoft}`,borderRadius:8,padding:8}}>
          {teamNames.map((name,i)=><div key={i} style={{marginBottom:5,display:"flex",alignItems:"center",gap:6}}>
            <span style={{color:textOff,fontSize:10,width:16,textAlign:"right"}}>{i+1}</span>
            <input value={name} aria-label={`Team ${i+1} Name`} onChange={e=>{const n=[...teamNames];n[i]=e.target.value;setTeamNames(n);}} placeholder={`Team ${i+1}`} style={{flex:1,background:surf2,border:`1px solid ${bdr}`,borderRadius:6,padding:"7px 10px",color:textHi,fontFamily:F,fontSize:12}}/>
          </div>)}
        </div>
        <button onClick={startTournament} style={{width:"100%",marginTop:10,padding:"12px 0",background:green,color:bg,border:"none",borderRadius:8,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:F}}>Turnier starten</button>
      </div>

      <div style={{background:card,border:`1px solid ${bdr}`,borderRadius:10,padding:12,width:"100%",maxWidth:340}}>
        {config.teamSize===8?(
          <p style={{color:textLow,fontSize:10,margin:0,lineHeight:1.6}}>
            <span style={{color:greenText}}>Gruppenphase (2×4 Teams):</span> {config.startScore} Single Out · Best of 3<br/>
            <span style={{color:orange}}>Halbfinale:</span> {config.startScore} Single Out · Best of 3<br/>
            <span style={{color:colBlue}}>Finale{config.thirdPlace?" & Platz 3":""}:</span> {config.startScore}{config.finalDoubleOut?" Double Out":" Single Out"} · Best of 5
          </p>
        ):(
          <p style={{color:textLow,fontSize:10,margin:0,lineHeight:1.6}}>
            <span style={{color:greenText}}>Vorrunden:</span> {config.startScore} Single Out · Best of {config.legsToWin*2-1}<br/>
            {config.finalDoubleOut&&<><span style={{color:orange}}>Finale:</span> {config.startScore} Double Out · Best of {config.legsToWin*2-1}<br/></>}
            {config.thirdPlace&&<><span style={{color:colBlue}}>Platz 3:</span> Verlierer der Halbfinals</>}
          </p>
        )}
      </div>
    </div>
  );

  // ── TV-ÜBERSICHT (dauerhafter Zuschauer-Screen) ──
  if(phase==="tv-overview"&&(bracket||groupPhase))return<TvAuto bracket={bracket} groupPhase={groupPhase} config={config} theme={theme} toggleTheme={toggleTheme}/>;

  // ── SCORING / TV ──
  if((phase==="scoring"||phase==="tv")&&(bracket||groupPhase)&&activeMatchId){
    const result=findMatchAnywhere(bracket,groupPhase,activeMatchId);
    if(!result)return null;
    return<><GlobalStyles/><ScoringView match={result.match} teams={result.teams} roundName={result.round.name} isDoubleOut={result.round.isDoubleOut} onBack={back} onUpdate={handleUpdate} isTV={phase==="tv"}/></>;
  }

  // ── STATS ──
  if(phase==="stats"&&bracket)return<><GlobalStyles/><StatsView bracket={bracket} onBack={()=>setPhase("bracket")}/></>;

  // ── SOUNDS ──
  if(phase==="settings")return<><GlobalStyles/><SettingsView sounds={sounds} onSave={(s)=>{setSounds(s);customSounds=s;}} onBack={()=>setPhase("bracket")}/></>;

  // ── GRUPPENPHASE ──
  if(phase==="groups"&&groupPhase)return<>
    <GroupOverview groupPhase={groupPhase} config={config} onOpen={openMatch} onStartKo={startKoPhase} onTvOverview={openTvOverview} onShowHelp={()=>setShowHelp(true)} onReset={()=>setConfirmReset(true)} theme={theme} toggleTheme={toggleTheme} tvBlocked={tvBlocked} onDismissTvBlocked={()=>setTvBlocked(false)} saveError={saveError} onDismissSaveError={()=>setSaveError(false)}/>
    {showHelp&&<HelpModal onClose={()=>setShowHelp(false)}/>}
    {confirmReset&&<ResetConfirmModal onCancel={()=>setConfirmReset(false)} onConfirm={resetTournament}/>}
  </>;

  // ── BRACKET ──
  const champion=getChampion(bracket);
  const mainRounds=bracket.rounds.filter(r=>!r.matches[0]?.isThirdPlace);
  const thirdRound=bracket.rounds.find(r=>r.matches[0]?.isThirdPlace);

  return(
    <div className="bracket-page" style={{minHeight:"100vh",background:bg,color:textHi,fontFamily:F}}>
      <GlobalStyles/>

      {/* ── Header (spans both columns on desktop) ── */}
      <div className="bracket-hdr" style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
        <div>
          <h2 style={{fontFamily:FD,fontSize:18,fontWeight:800,color:textHi,letterSpacing:"-0.01em",margin:0}}>{bracket.config.name}</h2>
          {bracket.config.date&&<div style={{fontSize:11,color:textLow,marginTop:2}}>{bracket.config.date}</div>}
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={openTvOverview} aria-label="TV-Übersicht öffnen" style={{background:colBlueDk,border:`1px solid ${colBlue}`,color:colBlue,borderRadius:6,padding:"7px 12px",cursor:"pointer",fontSize:11}}>📺 TV-Übersicht</button>
          <button onClick={()=>setPhase("stats")} aria-label="Statistiken" style={{background:surf2,border:`1px solid ${bdr}`,color:greenText,borderRadius:6,padding:"7px 12px",cursor:"pointer",fontSize:11}}>Stats</button>
          <button onClick={()=>setPhase("settings")} aria-label="Sounds konfigurieren" style={{background:surf2,border:`1px solid ${bdr}`,color:textLow,borderRadius:6,padding:"7px 12px",cursor:"pointer",fontSize:11}}>Sounds</button>
          <button onClick={()=>setShowHelp(true)} aria-label="Hilfe anzeigen" style={{background:surf2,border:`1px solid ${bdr}`,color:textLow,borderRadius:6,padding:"7px 12px",cursor:"pointer",fontSize:11}}>?</button>
          <button onClick={()=>setConfirmReset(true)} aria-label="Turnier zurücksetzen" style={{background:surf2,border:`1px solid ${bdr}`,color:textLow,borderRadius:6,padding:"7px 12px",cursor:"pointer",fontSize:11}}>Neu</button>
          <button onClick={toggleTheme} aria-label={theme==="dark"?"Zu Hellmodus wechseln":"Zu Dunkelmodus wechseln"} style={{background:surf2,border:`1px solid ${bdr}`,color:textMid,borderRadius:6,padding:"7px 10px",cursor:"pointer",fontSize:13}}>{theme==="dark"?"☀️":"🌙"}</button>
        </div>
      </div>

      {tvBlocked&&<div style={{background:colRedDk,border:`1px solid ${colRed}`,borderRadius:8,padding:"8px 14px",fontSize:11,color:colRed,display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
        <span>Browser hat das TV-Fenster blockiert (Popup-Blocker). Popups für diese Seite erlauben, dann nochmal auf "TV-Übersicht" klicken.</span>
        <button onClick={()=>setTvBlocked(false)} aria-label="Hinweis schließen" style={{background:"none",border:"none",color:colRed,fontSize:14,cursor:"pointer",flexShrink:0}}>✕</button>
      </div>}

      {saveError&&<div style={{background:colRedDk,border:`1px solid ${colRed}`,borderRadius:8,padding:"8px 14px",fontSize:11,color:colRed,display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
        <span>Automatisches Speichern fehlgeschlagen — Fortschritt könnte bei einem Neuladen verloren gehen.</span>
        <button onClick={()=>setSaveError(false)} aria-label="Hinweis schließen" style={{background:"none",border:"none",color:colRed,fontSize:14,cursor:"pointer",flexShrink:0}}>✕</button>
      </div>}

      {/* ── Bracket rounds (left column on desktop) ── */}
      <div className="bracket-main" style={{overflowX:"auto"}}>
        <div style={{display:"flex",gap:14,minWidth:"fit-content",alignItems:"flex-start"}}>
          {mainRounds.map((round,rIdx)=>(
            <div key={rIdx} style={{display:"flex",flexDirection:"column",gap:10,minWidth:190}}>
              <div style={{textAlign:"center",paddingBottom:4,borderBottom:`1px solid ${bdrSoft}`}}>
                <div style={{fontSize:12,fontWeight:700,color:round.isDoubleOut?orange:green}}>{round.name}</div>
                <div style={{fontSize:10,color:textLow,marginTop:2}}>{bracket.config.startScore} · {round.isDoubleOut?"Double Out":"Single Out"} · Bo{round.legsToWin*2-1}</div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:10,justifyContent:"space-around",minHeight:rIdx===0?"auto":rIdx===mainRounds.length-2?260:280}}>
                {round.matches.map(m=><MatchCard key={m.id} match={m} teams={bracket.teams} onOpen={openMatch}/>)}
              </div>
            </div>
          ))}
          {thirdRound&&<div style={{display:"flex",flexDirection:"column",gap:10,minWidth:190}}>
            <div style={{textAlign:"center",paddingBottom:4,borderBottom:`1px solid ${bdrSoft}`}}>
              <div style={{fontSize:12,fontWeight:700,color:colBlue}}>{thirdRound.name}</div>
              <div style={{fontSize:10,color:textLow,marginTop:2}}>{bracket.config.startScore} · {thirdRound.isDoubleOut?"Double Out":"Single Out"} · Bo{thirdRound.legsToWin*2-1}</div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:10,justifyContent:"center",minHeight:280}}>
              {thirdRound.matches.map(m=><MatchCard key={m.id} match={m} teams={bracket.teams} onOpen={openMatch}/>)}
            </div>
          </div>}
        </div>
      </div>

      {/* ── Sidebar (right column on desktop, stacks below on mobile) ── */}
      <aside className="bracket-aside" style={{display:"flex",flexDirection:"column",gap:12}}>
        {champion&&<div style={{padding:"20px 16px",background:greenDark,border:`1px solid ${greenBdr}`,borderRadius:12,textAlign:"center"}}>
          <div style={{fontSize:32}}>🏆</div>
          <div className="label-upper" style={{fontSize:10,color:greenText,marginTop:6}}>TURNIERSIEGER</div>
          <div style={{fontFamily:FD,fontSize:22,fontWeight:800,color:textHi,marginTop:6,lineHeight:1.2}}>{champion}</div>
        </div>}
        <div style={{padding:"12px 14px",background:card,border:`1px solid ${bdrSoft}`,borderRadius:8,fontSize:11,color:textOff,lineHeight:1.8}}>
          <div style={{color:textLow,fontWeight:600,marginBottom:6}}>Legende</div>
          <div>Match öffnen → Scoring</div>
          <div>TV — Zuschauer-Anzeige</div>
          <div>Stats — Spieler-Übersicht</div>
          <div>Sounds — Töne konfigurieren</div>
          <div style={{marginTop:8,color:textOff}}>Auto-Save aktiv</div>
        </div>
      </aside>
      {showHelp&&<HelpModal onClose={()=>setShowHelp(false)}/>}
      {confirmReset&&<ResetConfirmModal onCancel={()=>setConfirmReset(false)} onConfirm={resetTournament}/>}
    </div>
  );
}
