import { useState, useEffect, useMemo } from "react";
import * as Tone from "tone";

// ═══════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════
const IMPOSSIBLE = new Set([163,166,169,172,173,175,176,178,179]);
const COMMON = new Set([0,20,26,30,40,41,45,50,54,55,57,60,80,81,85,95,100,105,120,121,125,133,137,140,160,170,174,177,180]);
const FAVORITES = [0,26,41,45,60,80,85,100,121,140,180];
const CHECKOUTS_DO={170:"T20 T20 Bull",167:"T20 T19 Bull",164:"T20 T18 Bull",161:"T20 T17 Bull",160:"T20 T20 D20",158:"T20 T20 D19",157:"T20 T19 D20",156:"T20 T20 D18",155:"T20 T19 D19",154:"T20 T18 D20",153:"T20 T19 D18",152:"T20 T20 D16",151:"T20 T17 D20",150:"T20 T18 D18",149:"T20 T19 D16",148:"T20 T16 D20",147:"T20 T17 D18",146:"T20 T18 D16",145:"T20 T19 D14",144:"T20 T20 D12",143:"T20 T17 D16",142:"T20 T14 D20",141:"T20 T19 D12",140:"T20 T16 D16",139:"T20 T13 D20",138:"T20 T18 D12",137:"T20 T19 D10",136:"T20 T20 D8",135:"T20 T17 D12",134:"T20 T14 D16",133:"T20 T19 D8",132:"T20 T16 D12",131:"T20 T13 D16",130:"T20 T18 D8",129:"T19 T16 D12",128:"T18 T14 D16",127:"T20 T17 D8",126:"T19 T19 D6",125:"T20 T19 Bull",124:"T20 T16 D8",123:"T19 T16 D9",122:"T18 T20 D4",121:"T20 T11 D14",120:"T20 S20 D20",119:"T19 T12 D8",118:"T20 S18 D20",117:"T20 S17 D20",116:"T20 S16 D20",115:"T20 S15 D20",114:"T20 S14 D20",113:"T20 S13 D20",112:"T20 T12 D8",111:"T20 S11 D20",110:"T20 S10 D20",109:"T20 S9 D20",108:"T20 S8 D20",107:"T20 S7 D20",106:"T20 S6 D20",105:"T20 S5 D20",104:"T20 S4 D20",103:"T20 S3 D20",102:"T20 S2 D20",101:"T20 S1 D20",100:"T20 D20",99:"T19 S10 D16",98:"T20 D19",97:"T19 D20",96:"T20 D18",95:"T19 D19",94:"T18 D20",93:"T19 D18",92:"T20 D16",91:"T17 D20",90:"T18 D18",89:"T19 D16",88:"T16 D20",87:"T17 D18",86:"T18 D16",85:"T19 D14",84:"T20 D12",83:"T17 D16",82:"T14 D20",81:"T19 D12",80:"T20 D10",79:"T13 D20",78:"T18 D12",77:"T19 D10",76:"T20 D8",75:"T17 D12",74:"T14 D16",73:"T19 D8",72:"T16 D12",71:"T13 D16",70:"T18 D8",69:"T19 D6",68:"T20 D4",67:"T17 D8",66:"T10 D18",65:"T19 D4",64:"T16 D8",63:"T13 D12",62:"T10 D16",61:"T15 D8",60:"S20 D20",59:"S19 D20",58:"S18 D20",57:"S17 D20",56:"S16 D20",55:"S15 D20",54:"S14 D20",53:"S13 D20",52:"S12 D20",51:"S11 D20",50:"S10 D20",49:"S9 D20",48:"S8 D20",47:"S7 D20",46:"S6 D20",45:"S5 D20",44:"S4 D20",43:"S3 D20",42:"S2 D20",41:"S1 D20",40:"D20",38:"D19",36:"D18",34:"D17",32:"D16",30:"D15",28:"D14",26:"D13",24:"D12",22:"D11",20:"D10",18:"D9",16:"D8",14:"D7",12:"D6",10:"D5",8:"D4",6:"D3",4:"D2",2:"D1",39:"S7 D16",37:"S5 D16",35:"S3 D16",33:"S1 D16",31:"S15 D8",29:"S13 D8",27:"S11 D8",25:"S9 D8",23:"S7 D8",21:"S5 D8",19:"S3 D8",17:"S1 D8",15:"S7 D4",13:"S5 D4",11:"S3 D4",9:"S1 D4",7:"S3 D2",5:"S1 D2",3:"S1 D1"};

const SOUND_EVENTS=[{key:"180",label:"180!"},{key:"140",label:"140+"},{key:"100",label:"100+"},{key:"checkout",label:"Checkout"},{key:"bust",label:"Bust"},{key:"winner",label:"Sieger"}];
const TEAM_SIZES=[4,8,16,32];

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
const SK="dart-turnier-v2";
const save=async(s)=>{try{await window.storage.set(SK,JSON.stringify(s));}catch(e){}};
const load=async()=>{try{const r=await window.storage.get(SK);return r?JSON.parse(r.value):null;}catch(e){return null;}};
const clear=async()=>{try{await window.storage.delete(SK);}catch(e){}};

// ═══════════════════════════════════════════
// BRACKET ENGINE (dynamic team count)
// ═══════════════════════════════════════════
function newMatch(id,t1,t2,roundIdx,isThirdPlace=false){
  return{id,t1,t2,roundIdx,isThirdPlace,legs:[],leg1:501,leg2:501,s1:0,s2:0,winner:null,history1:[],history2:[],starter:1,legStarter:1};
}

function buildBracket(teams,config){
  const n=teams.length;
  const numRounds=Math.log2(n);
  const rounds=[];
  for(let r=0;r<numRounds;r++){
    const matchCount=n/Math.pow(2,r+1);
    const matches=[];
    for(let m=0;m<matchCount;m++){
      const t1=r===0?m*2:null;
      const t2=r===0?m*2+1:null;
      matches.push(newMatch(`r${r}m${m}`,t1,t2,r));
    }
    rounds.push({matches,name:ROUND_NAMES[numRounds]?.[r]||`Runde ${r+1}`,isDoubleOut:r===numRounds-1&&config.finalDoubleOut});
  }
  // Third-place match
  if(config.thirdPlace&&numRounds>=2){
    rounds.push({matches:[newMatch("3rd",null,null,numRounds,true)],name:"Platz 3",isDoubleOut:config.finalDoubleOut});
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

// ═══════════════════════════════════════════
// STATS (computed from match data — undo-safe)
// ═══════════════════════════════════════════
function computeStats(bracket){
  if(!bracket)return[];
  const s=bracket.teams.map((name,i)=>({name,i,throws:[],legs:0,matchesWon:0}));
  for(const round of bracket.rounds){
    for(const m of round.matches){
      if(m.t1===null||m.t2===null)continue;
      // Finished legs
      for(const leg of m.legs){
        (leg.h1||[]).forEach(t=>s[m.t1].throws.push(t));
        (leg.h2||[]).forEach(t=>s[m.t2].throws.push(t));
        const w=leg.winner===1?m.t1:m.t2;
        s[w].legs++;
      }
      // Current leg in progress
      m.history1.forEach(t=>s[m.t1].throws.push(t));
      m.history2.forEach(t=>s[m.t2].throws.push(t));
      // Match winner
      if(m.winner!==null)s[m.winner].matchesWon++;
    }
  }
  return s.map(x=>{
    const t=x.throws;
    const avg=t.length?t.reduce((a,b)=>a+b,0)/t.length:0;
    return{...x,avg:avg.toFixed(1),ton80:t.filter(v=>v===180).length,ton40:t.filter(v=>v>=140).length,ton:t.filter(v=>v>=100).length,highest:t.length?Math.max(...t):0,totalThrows:t.length};
  }).sort((a,b)=>b.avg-a.avg);
}

// ═══════════════════════════════════════════
// CHECKOUT HELPER
// ═══════════════════════════════════════════
function getCheckout(rem,isDO){
  if(isDO)return CHECKOUTS_DO[rem]||null;
  if(rem<=60)return`S${rem}`;
  if(rem<=180)return null;
}

// ═══════════════════════════════════════════
// COLOR TOKENS (OKLCH — perceptually uniform)
// ═══════════════════════════════════════════
const F  = "'Figtree','Helvetica Neue',sans-serif";     // UI: labels, buttons, body
const FD = "'Funnel Display','Arial Narrow',sans-serif"; // Display: scores, headlines
// Surfaces — tinted toward hue 145 (green) for brand cohesion
const bg        = "oklch(13% 0.006 145)";  // dark charcoal
const card      = "oklch(17% 0.007 145)";  // card surface
const surf2     = "oklch(21% 0.006 145)";  // inputs, secondary buttons
const bdr       = "oklch(28% 0.007 145)";  // default border
const bdrSoft   = "oklch(21% 0.006 145)";  // subtle dividers
// Text — all ≥4.5:1 on `bg` (WCAG AA)
const textHi    = "oklch(93% 0.003 145)";  // primary   ≈ #eee
const textMid   = "oklch(72% 0.005 145)";  // secondary ≈ #aaa  (5.8:1)
const textLow   = "oklch(62% 0.005 145)";  // tertiary  ≈ #888  (4.6:1) — raises #666/#555
const textOff   = "oklch(32% 0.004 145)";  // disabled  (intentionally low)
// Accent — green (win, active, checkout)
const green     = "oklch(75% 0.17  142)";  // ≈ #6fcf6f
const greenDark = "oklch(18% 0.04  142)";  // ≈ #1a2a1a
const greenText = "oklch(83% 0.14  142)";  // ≈ #aee86f
const greenBdr  = "oklch(38% 0.12  142)";  // ≈ #2d5a2d
// Warning — orange (Double Out, attention)
const orange     = "oklch(77% 0.14 55)";   // ≈ #f0a050
const orangeDark = "oklch(17% 0.04 55)";   // ≈ #3a2a1a
// Status
const colRed    = "oklch(70% 0.18 20)";    // bust / undo  ≈ #ff8888
const colRedDk  = "oklch(13% 0.04 20)";    // ≈ #2a1a1a
const colBlue   = "oklch(67% 0.14 270)";   // random / info ≈ #8888ff
const colBlueDk = "oklch(13% 0.03 270)";   // ≈ #1a1a2a

// ─── Global Styles (fonts + focus-visible + button reset) ───
function GlobalStyles(){
  return<style>{`
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
    @media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important;transform:none!important;}}
    @keyframes tv-bust{0%{opacity:0}5%{opacity:0.92}85%{opacity:0.92}100%{opacity:0}}
    @keyframes tv-winner{from{opacity:0;transform:scale(0.95)}to{opacity:1;transform:scale(1)}}
  `}</style>;
}

// ═══════════════════════════════════════════
// SCORING VIEW
// ═══════════════════════════════════════════
function ScoringView({match,teams,roundName,isDoubleOut,onBack,onUpdate,isTV}){
  const[ap,setAp]=useState(match.legStarter||1);
  const[bustMsg,setBust]=useState(null);
  const[tab,setTab]=useState(0);
  const[showGrid,setShowGrid]=useState(false);
  const[npad,setNpad]=useState("");
  const[showStarter,setShowStarter]=useState(!match.history1.length&&!match.history2.length&&!match.legs.length);
  const[darts,setDarts]=useState([]);
  const[mm,setMm]=useState("S");

  const t1=match.t1!==null?teams[match.t1]:"—";
  const t2=match.t2!==null?teams[match.t2]:"—";
  const curLeg=match.legs.length+1;
  const rem=ap===1?match.leg1:match.leg2;
  const co1=getCheckout(match.leg1,isDoubleOut);
  const co2=getCheckout(match.leg2,isDoubleOut);

  const addScore=(score)=>{
    if(score<0||score>180)return;
    if(IMPOSSIBLE.has(score)){setBust("Unmöglich!");setTimeout(()=>setBust(null),1200);return;}
    const m=JSON.parse(JSON.stringify(match));
    const k=ap===1?"leg1":"leg2",hk=ap===1?"history1":"history2";
    const rest=m[k]-score;
    if(rest<0||(isDoubleOut&&rest===1)){setBust("BUST!");playSound("bust");setTimeout(()=>setBust(null),1200);setAp(ap===1?2:1);return;}
    m[k]=rest;m[hk]=[...m[hk],score];
    if(score===180)playSound("180");else if(score>=140)playSound("140");else if(score>=100)playSound("100");
    if(rest===0){
      playSound("checkout");
      const sk=ap===1?"s1":"s2";m[sk]++;
      m.legs.push({winner:ap,h1:[...m.history1],h2:[...m.history2]});
      if(m[sk]>=2){m.winner=ap===1?m.t1:m.t2;setTimeout(()=>playSound("winner"),600);onUpdate(m);return;}
      m.legStarter=m.legStarter===1?2:1;m.leg1=501;m.leg2=501;m.history1=[];m.history2=[];
      setAp(m.legStarter);onUpdate(m);return;
    }
    setAp(ap===1?2:1);onUpdate(m);
  };

  const undoThrow=()=>{const m=JSON.parse(JSON.stringify(match));const op=ap===1?2:1;const hk=op===1?"history1":"history2",lk=op===1?"leg1":"leg2";if(!m[hk].length)return;m[lk]+=m[hk].pop();setAp(op);onUpdate(m);};
  const undoLeg=()=>{if(!match.legs.length)return;const m=JSON.parse(JSON.stringify(match));const l=m.legs.pop();const sk=l.winner===1?"s1":"s2";m[sk]--;m.history1=l.h1;m.history2=l.h2;m.leg1=501-l.h1.reduce((a,b)=>a+b,0);m.leg2=501-l.h2.reduce((a,b)=>a+b,0);m.winner=null;m.legStarter=m.legStarter===1?2:1;setAp(1);onUpdate(m);};
  const selectStarter=(p)=>{const m=JSON.parse(JSON.stringify(match));m.starter=p;m.legStarter=p;setAp(p);setShowStarter(false);onUpdate(m);};

  const isReady=match.t1!==null&&match.t2!==null;

  // Dart-by-dart helpers
  const dv=(d)=>d.field===25?(d.multi==="D"?50:25):d.field===0?0:d.field*(d.multi==="T"?3:d.multi==="D"?2:1);
  const dl=(d)=>d.field===25?(d.multi==="D"?"Bull":"S-Bull"):d.field===0?"Miss":`${d.multi}${d.field}`;
  const dTotal=darts.reduce((s,d)=>s+dv(d),0);
  const addDart=(f)=>{if(darts.length>=3)return;if(f===25&&mm==="T")return;setDarts([...darts,{field:f,multi:f===0?"S":mm}]);};

  // ── TV VIEW ──
  if(isTV){
    const sides=[{p:1,name:t1,rem:match.leg1,s:match.s1,co:co1},{p:2,name:t2,rem:match.leg2,s:match.s2,co:co2}];
    return(
      <div style={{minHeight:"100vh",background:bg,color:textHi,fontFamily:F,display:"flex",flexDirection:"column",overflow:"hidden",position:"relative"}}>
        {bustMsg&&<div style={{position:"fixed",inset:0,background:`oklch(14% 0.05 20)`,zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",animation:"tv-bust 1.2s ease-out forwards",pointerEvents:"none"}}>
          <div style={{fontFamily:FD,fontSize:"20vw",fontWeight:800,color:colRed,letterSpacing:"-0.02em"}}>{bustMsg}</div>
        </div>}

        {match.winner&&<div style={{position:"fixed",inset:0,background:greenDark,zIndex:50,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",animation:"tv-winner 0.5s ease-out forwards"}}>
          <div className="label-upper" style={{fontSize:"min(18px,1.8vw)",color:greenText,letterSpacing:"0.14em",marginBottom:"3vh"}}>SIEGER</div>
          <div style={{fontFamily:FD,fontSize:"min(120px,11vw)",fontWeight:800,color:textHi,lineHeight:0.92,letterSpacing:"-0.02em",textAlign:"center",padding:"0 6vw"}}>{teams[match.winner]}</div>
          <div style={{fontFamily:FD,fontSize:"min(48px,4.5vw)",fontWeight:700,color:green,marginTop:"3vh"}}>gewinnt!</div>
        </div>}

        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 40px",borderBottom:`1px solid ${bdrSoft}`,flexShrink:0}}>
          <div className="label-upper" style={{fontSize:13,color:textLow,letterSpacing:"0.08em"}}>{roundName}</div>
          <div className="label-upper" style={{fontSize:11,padding:"4px 16px",background:isDoubleOut?orangeDark:greenDark,color:isDoubleOut?orange:green,borderRadius:4}}>{isDoubleOut?"DOUBLE OUT":"SINGLE OUT"}</div>
          <div style={{display:"flex",alignItems:"center",gap:20}}>
            <div className="label-upper" style={{fontSize:13,color:textLow}}>LEG {curLeg}</div>
            <button onClick={()=>window.close()} aria-label="Schließen" style={{background:"none",border:`1px solid ${bdrSoft}`,borderRadius:6,color:textOff,fontSize:16,padding:"2px 10px",cursor:"pointer",fontFamily:F,lineHeight:1}}>✕</button>
          </div>
        </div>

        <div style={{flex:1,display:"flex",position:"relative"}}>
          <div style={{position:"absolute",top:0,bottom:0,left:"50%",width:1,background:bdrSoft,transform:"translateX(-50%)",pointerEvents:"none"}}/>
          {sides.map(({p,name,rem:r,s,co})=>{
            const active=ap===p;
            return(
              <div key={p} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"5vh 6vw",background:active?"oklch(19% 0.009 145)":"oklch(15% 0.005 145)",borderTop:`4px solid ${active?green:bdrSoft}`,transition:"background 400ms ease,border-color 400ms ease",position:"relative"}}>
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
      <div style={{fontSize:14,color:textLow,marginBottom:20}}>Wer beginnt?</div>
      {[{p:1,n:t1},{p:2,n:t2}].map(({p,n})=><button key={p} onClick={()=>selectStarter(p)} style={{width:"100%",maxWidth:300,padding:"20px 0",marginBottom:12,background:greenDark,border:`1px solid ${greenBdr}`,borderRadius:10,color:green,fontSize:18,fontWeight:700,cursor:"pointer",fontFamily:F}}>{n}</button>)}
      <button onClick={()=>{const b=new Uint8Array(1);crypto.getRandomValues(b);selectStarter(b[0]<128?1:2);}} style={{marginTop:8,padding:"12px 24px",background:colBlueDk,border:`1px solid ${colBlue}`,borderRadius:8,color:colBlue,fontSize:13,cursor:"pointer",fontFamily:F}}>🎲 Zufällig</button>
    </div>
  );

  if(!isReady)return<div style={{minHeight:"100vh",background:bg,color:textOff,fontFamily:F,display:"flex",alignItems:"center",justifyContent:"center"}}>Warte auf vorherige Runde...</div>;

  if(match.winner)return(
    <div style={{minHeight:"100vh",background:bg,color:textHi,fontFamily:F,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:10,padding:20}}>
      <div style={{fontSize:48}}>🏆</div>
      <div style={{fontFamily:FD,fontSize:22,fontWeight:800,color:green,letterSpacing:"-0.01em"}}>{teams[match.winner]} gewinnt!</div>
      <div className="score-num" style={{fontSize:14,color:textLow,marginTop:2}}>{match.s1} : {match.s2}</div>
      <div style={{display:"flex",gap:10,marginTop:16}}>
        <button onClick={onBack} style={{padding:"10px 20px",background:greenDark,border:`1px solid ${greenBdr}`,borderRadius:8,color:greenText,fontSize:13,cursor:"pointer",fontFamily:F}}>Zurück</button>
        <button onClick={undoLeg} style={{padding:"10px 20px",background:colRedDk,border:`1px solid ${colRed}`,borderRadius:8,color:colRed,fontSize:12,cursor:"pointer",fontFamily:F}}>↩ Leg zurück</button>
      </div>
    </div>
  );

  // ── GRIDS ──
  const renderGrid=(from,to)=>{const nums=[];for(let i=from;i<=to;i++)if(!IMPOSSIBLE.has(i))nums.push(i);
    return<div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:5,padding:"6px 8px",overflowY:"auto",flex:1}}>{nums.map(n=>{const dis=n>rem||(isDoubleOut&&(rem-n)===1);const c=COMMON.has(n);return<button key={n} onClick={()=>!dis&&addScore(n)} aria-disabled={dis?"true":undefined} style={{background:dis?bg:c?greenDark:surf2,border:`1px solid ${dis?bdrSoft:c?greenBdr:bdr}`,color:dis?textOff:c?green:textMid,borderRadius:6,padding:"10px 0",fontSize:14,fontWeight:c?700:400,cursor:dis?"default":"pointer",fontFamily:F}}>{n}</button>})}</div>;};

  const renderFavs=()=><div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,padding:"10px",flex:1,alignContent:"start"}}>{FAVORITES.map(n=>{const dis=n>rem||(isDoubleOut&&(rem-n)===1);return<button key={n} onClick={()=>!dis&&addScore(n)} aria-disabled={dis?"true":undefined} style={{background:dis?bg:n===180?colRedDk:n===0?colBlueDk:greenDark,border:`1px solid ${dis?bdrSoft:n===180?colRed:n===0?colBlue:greenBdr}`,color:dis?textOff:n===180?colRed:n===0?colBlue:green,borderRadius:10,padding:"18px 0",fontSize:22,fontWeight:800,cursor:dis?"default":"pointer",fontFamily:F}}>{n}</button>})}</div>;

  const renderNumpad=()=>{const proj=npad?rem-Number(npad):null;return<div style={{padding:"6px 10px",flex:1,display:"flex",flexDirection:"column"}}><div className="score-num" style={{textAlign:"center",padding:"4px 0",fontSize:32,fontWeight:700,color:npad?textHi:textOff,minHeight:44}}>{npad||"0"}</div><div style={{textAlign:"center",fontSize:11,minHeight:18,color:proj===null?textOff:proj<0||proj===1&&isDoubleOut?colRed:proj===0?green:textMid,marginBottom:4}}>{proj===null?"Rest eingeben":proj<0||(proj===1&&isDoubleOut)?"BUST":proj===0?"Checkout!":` → Rest: ${proj}`}</div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,flex:1}}>{[1,2,3,4,5,6,7,8,9].map(d=><button key={d} onClick={()=>npad.length<3&&setNpad(npad+d)} style={{background:surf2,border:`1px solid ${bdr}`,borderRadius:8,padding:"12px 0",fontSize:20,color:textHi,cursor:"pointer",fontFamily:F,fontWeight:600}}>{d}</button>)}<button onClick={()=>setNpad("")} style={{background:surf2,border:`1px solid ${bdr}`,borderRadius:8,padding:"12px 0",fontSize:13,color:textLow,cursor:"pointer",fontFamily:F}}>C</button><button onClick={()=>npad.length<3&&setNpad(npad+"0")} style={{background:surf2,border:`1px solid ${bdr}`,borderRadius:8,padding:"12px 0",fontSize:20,color:textHi,cursor:"pointer",fontFamily:F,fontWeight:600}}>0</button><button onClick={()=>{if(npad){addScore(Number(npad));setNpad("");}}} style={{background:npad?green:surf2,border:`1px solid ${npad?green:bdr}`,borderRadius:8,padding:"12px 0",fontSize:14,color:npad?bg:textOff,cursor:npad?"pointer":"default",fontFamily:F,fontWeight:700}}>OK</button></div></div>;}

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
        <button onClick={()=>setDarts(darts.slice(0,-1))} aria-label="Letzten Dart entfernen" style={{flex:1,padding:"0",background:surf2,border:`1px solid ${bdr}`,borderRadius:8,color:orange,fontSize:14,cursor:"pointer",fontFamily:F}}>↩</button>
        <button onClick={()=>{if(darts.length){addScore(dTotal);setDarts([]);}}} style={{flex:2,padding:"10px 0",background:darts.length?green:surf2,border:`1px solid ${darts.length?green:bdr}`,borderRadius:8,color:darts.length?bg:textOff,fontSize:14,fontWeight:700,cursor:darts.length?"pointer":"default",fontFamily:F}}>{darts.length?`${dTotal} eintragen`:"Darts eingeben"}</button>
      </div>
    </div>;};

  const sides=[{p:1,name:t1,r:match.leg1,h:match.history1,s:match.s1,co:co1},{p:2,name:t2,r:match.leg2,h:match.history2,s:match.s2,co:co2}];

  return(
    <div style={{minHeight:"100vh",background:bg,color:textHi,fontFamily:F,display:"flex",flexDirection:"column",maxWidth:420,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",padding:"10px 12px",borderBottom:`1px solid ${bdrSoft}`}}>
        <button onClick={onBack} aria-label="Zurück" style={{background:"none",border:"none",color:textLow,fontSize:20,cursor:"pointer",padding:"0 12px 0 0"}}>←</button>
        <div style={{flex:1}}><span style={{fontSize:12,color:textMid}}>{roundName}</span><span style={{marginLeft:6,fontSize:9,padding:"2px 5px",background:isDoubleOut?orangeDark:greenDark,color:isDoubleOut?orange:green,borderRadius:4}}>{isDoubleOut?"DO":"SO"}</span></div>
        <span style={{fontSize:11,color:textLow,marginRight:6}}>Leg {curLeg}</span>
        <button onClick={undoThrow} aria-label="Letzten Wurf zurücknehmen" style={{background:surf2,border:`1px solid ${bdr}`,borderRadius:6,color:orange,fontSize:13,padding:"0 14px",cursor:"pointer",fontFamily:F,marginRight:4}}>↩</button>
        {match.legs.length>0&&<button onClick={undoLeg} aria-label="Letztes Leg zurücknehmen" style={{background:surf2,border:`1px solid ${bdr}`,borderRadius:6,color:colRed,fontSize:11,padding:"0 10px",cursor:"pointer",fontFamily:F}}>↩L</button>}
      </div>
      <div style={{display:"flex",gap:8,padding:"8px 10px"}}>
        {sides.map(({p,name,r,h,s,co})=><button key={p} onClick={()=>setAp(p)} aria-label={`${name}, Rest: ${r}`} aria-pressed={ap===p} style={{flex:1,padding:"8px 6px",borderRadius:10,background:ap===p?greenDark:card,border:`2px solid ${ap===p?green:bdr}`,display:"flex",flexDirection:"column",width:"100%"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:11,color:ap===p?greenText:textLow,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:80}}>{name}</span><div style={{display:"flex",gap:2}}>{[0,1].map(i=><div key={i} style={{width:8,height:8,borderRadius:"50%",background:i<s?green:bdr,border:`1px solid ${i<s?green:textOff}`}}/>)}</div></div>
          <div className="score-num" style={{fontSize:36,fontWeight:800,textAlign:"center",color:r===0?green:textHi,lineHeight:1.1}}>{r}</div>
          {co&&r<=170&&r>1&&<div style={{fontSize:9,color:orange,textAlign:"center",marginTop:2}}>{co}</div>}
          <div style={{fontSize:9,color:textOff,textAlign:"center",marginTop:3,height:14,overflow:"hidden"}}>{h.slice(-5).join("·")}</div>
        </button>)}
      </div>
      {bustMsg&&<div aria-live="assertive" style={{textAlign:"center",padding:"4px 0",color:colRed,fontSize:18,fontWeight:800}}>{bustMsg}</div>}
      <div style={{borderBottom:`1px solid ${bdrSoft}`}}>
        <div role="tablist" style={{display:"flex",padding:"0 8px"}}>
          {[{id:0,l:"Favoriten"},{id:5,l:"Darts"},{id:4,l:"Numpad"}].map(t=><button key={t.id} role="tab" aria-selected={tab===t.id} onClick={()=>setTab(t.id)} style={{flex:1,padding:"6px 0",fontSize:11,background:"transparent",border:"none",borderBottom:tab===t.id?`2px solid ${green}`:"2px solid transparent",color:tab===t.id?green:textLow,cursor:"pointer",fontFamily:F,fontWeight:tab===t.id?700:400}}>{t.l}</button>)}
          <button onClick={()=>{const n=!showGrid;setShowGrid(n);if(n&&![1,2,3].includes(tab))setTab(1);if(!n&&[1,2,3].includes(tab))setTab(0);}} aria-expanded={showGrid} style={{padding:"6px 10px",fontSize:11,background:"transparent",border:"none",borderBottom:[1,2,3].includes(tab)?`2px solid ${green}`:"2px solid transparent",color:[1,2,3].includes(tab)?green:textLow,cursor:"pointer",fontFamily:F,fontWeight:[1,2,3].includes(tab)?700:400}}>Zahl {showGrid?"▲":"▼"}</button>
        </div>
        {showGrid&&<div role="tablist" style={{display:"flex",padding:"0 8px 4px"}}>
          {[{id:1,l:"0–60"},{id:2,l:"61–120"},{id:3,l:"121–180"}].map(t=><button key={t.id} role="tab" aria-selected={tab===t.id} onClick={()=>setTab(t.id)} style={{flex:1,padding:"4px 0",fontSize:10,background:"transparent",border:"none",borderBottom:tab===t.id?`2px solid ${green}`:"2px solid transparent",color:tab===t.id?green:textOff,cursor:"pointer",fontFamily:F,fontWeight:tab===t.id?600:400}}>{t.l}</button>)}
        </div>}
      </div>
      <div style={{flex:1,display:"flex",flexDirection:"column",minHeight:250,overflowY:"auto"}}>
        {tab===5&&renderDarts()}{tab===0&&renderFavs()}{tab===1&&renderGrid(0,60)}{tab===2&&renderGrid(61,120)}{tab===3&&renderGrid(121,180)}{tab===4&&renderNumpad()}
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
      <div style={{display:"flex",alignItems:"center",marginBottom:16}}><button onClick={onBack} aria-label="Zurück" style={{background:"none",border:"none",color:textLow,fontSize:20,cursor:"pointer",padding:"0 12px 0 0"}}>←</button><span style={{fontSize:14,fontWeight:700}}>Statistiken</span></div>
      {best&&best.totalThrows>0&&<div style={{textAlign:"center",padding:"14px",marginBottom:14,background:greenDark,border:`1px solid ${greenBdr}`,borderRadius:12}}><div className="label-upper" style={{fontSize:10,color:greenText}}>BESTES TEAM (Ø)</div><div style={{fontFamily:FD,fontSize:20,fontWeight:800,marginTop:4}}>{best.name}</div><div style={{fontSize:13,color:green,marginTop:2}}>Ø {best.avg} pro Aufnahme</div></div>}
      {stats.filter(s=>s.totalThrows>0||s.matchesWon>0).map((s,i)=><div key={i} style={{background:card,border:`1px solid ${bdr}`,borderRadius:10,padding:"12px 14px",marginBottom:8}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{fontFamily:FD,fontSize:14,fontWeight:700,color:textHi}}>{s.name}</span><span className="score-num" style={{fontSize:12,color:green}}>{s.totalThrows>0?`Ø ${s.avg}`:"—"}</span></div>
        <div style={{display:"flex",gap:10,flexWrap:"wrap",fontSize:11,color:textLow}}><span>Wrf {s.totalThrows}</span><span>Sieg {s.matchesWon}</span><span>Legs {s.legs}</span><span style={{color:s.ton80>0?colRed:textLow}}>180: {s.ton80}x</span><span style={{color:s.ton40>0?orange:textLow}}>140+: {s.ton40}x</span><span style={{color:s.ton>0?greenText:textLow}}>100+: {s.ton}x</span><span>Hi: {s.highest||"—"}</span></div>
      </div>)}
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
      <div style={{display:"flex",alignItems:"center",marginBottom:16}}><button onClick={onBack} aria-label="Zurück" style={{background:"none",border:"none",color:textLow,fontSize:20,cursor:"pointer",padding:"0 12px 0 0"}}>←</button><span style={{fontSize:14,fontWeight:700}}>Sounds</span></div>
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
// HELP MODAL
// ═══════════════════════════════════════════
function HelpModal({onClose}){
  return(
    <div style={{position:"fixed",inset:0,background:"oklch(0% 0 0 / 0.72)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={onClose}>
      <div style={{background:card,border:`1px solid ${bdrSoft}`,borderRadius:14,padding:"20px 24px",maxWidth:340,width:"100%"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <span style={{fontSize:14,fontWeight:700,color:textHi,fontFamily:F}}>Hilfe</span>
          <button onClick={onClose} aria-label="Schließen" style={{background:"none",border:"none",color:textLow,fontSize:22,cursor:"pointer",lineHeight:1,padding:"0 0 0 16px"}}>×</button>
        </div>
        <div style={{fontSize:11,color:textLow,lineHeight:1.9,fontFamily:F}}>
          <div style={{color:textMid,fontWeight:600,marginBottom:2,fontSize:10,letterSpacing:"0.06em"}}>SCORING-TABS</div>
          <div><span style={{color:greenText}}>Favoriten</span> — häufige Aufnahmen (26, 41, 60…)</div>
          <div><span style={{color:greenText}}>Darts</span> — Einzeldarts: Feld + S/D/T auswählen</div>
          <div><span style={{color:greenText}}>Numpad</span> — Gesamtpunkte direkt eintippen</div>
          <div><span style={{color:greenText}}>Zahl ▼</span> — alle Werte 0–180 als Raster</div>
          <div style={{marginTop:12,color:textMid,fontWeight:600,marginBottom:2,fontSize:10,letterSpacing:"0.06em"}}>SPIELMODUS</div>
          <div><span style={{color:green}}>Single Out</span> — letzter Dart darf auf alles</div>
          <div><span style={{color:orange}}>Double Out</span> — letzter Dart muss Double oder Bull sein</div>
          <div style={{marginTop:12,color:textMid,fontWeight:600,marginBottom:2,fontSize:10,letterSpacing:"0.06em"}}>AKTIONEN</div>
          <div><span style={{color:colRed}}>BUST</span> — Überwurf, Rest bleibt unverändert</div>
          <div>↩ — letzten Einzelwurf zurücknehmen</div>
          <div>↩L — letztes Leg komplett zurücksetzen</div>
          <div style={{marginTop:12,color:textOff}}>Fortschritt wird automatisch gespeichert.</div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// MATCH CARD
// ═══════════════════════════════════════════
function MatchCard({match,teams,onOpen,onTV}){
  const t1=match.t1!==null?teams[match.t1]:"—";const t2=match.t2!==null?teams[match.t2]:"—";
  const done=match.winner!==null;const ready=match.t1!==null&&match.t2!==null;
  return<div>
    <button onClick={()=>onOpen(match.id)} disabled={!ready} style={{width:"100%",display:"block",textAlign:"left",background:done?greenDark:card,border:`1px solid ${done?greenBdr:bdr}`,borderRadius:10,padding:"10px 14px",minWidth:170,color:"inherit"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}><span style={{color:match.winner===match.t1?green:textMid,fontSize:13,fontWeight:match.winner===match.t1?700:400,fontFamily:F,maxWidth:110,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t1}</span><span style={{color:textLow,fontSize:14,fontFamily:F,fontWeight:700}}>{match.s1}</span></div>
      <div style={{height:1,background:bdr}}/>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:5}}><span style={{color:match.winner===match.t2?green:textMid,fontSize:13,fontWeight:match.winner===match.t2?700:400,fontFamily:F,maxWidth:110,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t2}</span><span style={{color:textLow,fontSize:14,fontFamily:F,fontWeight:700}}>{match.s2}</span></div>
      {ready&&!done&&<div style={{textAlign:"center",marginTop:6,fontSize:10,color:green}}>▶ Spielen</div>}
      {match.isThirdPlace&&<div style={{textAlign:"center",marginTop:4,fontSize:9,color:orange}}>🥉 Platz 3</div>}
    </button>
    {ready&&!done&&onTV&&<button onClick={()=>onTV(match.id)} style={{width:"100%",marginTop:4,padding:"4px 0",background:colBlueDk,border:`1px solid ${colBlue}`,borderRadius:6,color:colBlue,fontSize:9,cursor:"pointer",fontFamily:F}}>📺 TV</button>}
  </div>;
}

// ═══════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════
export default function DartTurnier(){
  const[phase,setPhase]=useState("loading");
  const[config,setConfig]=useState({name:"Dart Turnier",date:"",teamSize:8,finalDoubleOut:true,thirdPlace:true,legsToWin:2});
  const[teamNames,setTeamNames]=useState([]);
  const[showHelp,setShowHelp]=useState(false);
  const[confirmReset,setConfirmReset]=useState(false);
  const[bracket,setBracket]=useState(null);
  const[activeMatchId,setActiveMatchId]=useState(null);
  const[sounds,setSounds]=useState({});

  useEffect(()=>{(async()=>{
    const tvParam=new URLSearchParams(window.location.search).get('tv');
    const saved=await load();
    if(saved?.bracket){
      setBracket(saved.bracket);setConfig(saved.config||config);setSounds(saved.sounds||{});customSounds=saved.sounds||{};
      if(tvParam){setActiveMatchId(tvParam);setPhase("tv");}
      else{setPhase("bracket");}
    } else{setTeamNames(Array(8).fill(""));setPhase("setup");}
  })();},[]);

  // Live-update TV window when scorer saves
  useEffect(()=>{
    if(!new URLSearchParams(window.location.search).get('tv'))return;
    const onSt=(e)=>{if(e.key!==SK||!e.newValue)return;try{const s=JSON.parse(e.newValue);if(s?.bracket)setBracket(s.bracket);}catch(err){}};
    window.addEventListener('storage',onSt);
    return()=>window.removeEventListener('storage',onSt);
  },[]);

  useEffect(()=>{if(bracket)save({bracket,config,sounds});},[bracket,config,sounds]);

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
    const names=teamNames.map((n,i)=>n.trim()||`Team ${i+1}`);
    const b=buildBracket(names,config);
    setBracket(b);setPhase("bracket");
  };

  const openMatch=(id)=>{setActiveMatchId(id);setPhase("scoring");};
  const openTV=(id)=>{const u=new URL(window.location.href);u.search=`?tv=${encodeURIComponent(id)}`;u.hash='';window.open(u.toString(),'dart-tv','noopener');};
  const back=()=>{setActiveMatchId(null);setPhase("bracket");};

  const handleUpdate=(updatedMatch)=>{
    setBracket(prev=>{const b=JSON.parse(JSON.stringify(prev));setMatchIn(b,updatedMatch);propagateBracket(b);return b;});
  };

  const resetTournament=()=>{clear();setBracket(null);setTeamNames(Array(config.teamSize).fill(""));setConfirmReset(false);setPhase("setup");};

  if(phase==="loading")return<><GlobalStyles/><div style={{minHeight:"100vh",background:bg,color:textLow,fontFamily:F,display:"flex",alignItems:"center",justifyContent:"center"}}>Lade...</div></>;

  // ── SETUP ──
  if(phase==="setup")return(
    <div style={{minHeight:"100vh",background:bg,color:textHi,fontFamily:F,display:"flex",flexDirection:"column",alignItems:"center",padding:"24px 16px"}}>
      <GlobalStyles/>
      <div style={{textAlign:"center",marginBottom:20}}><div style={{fontSize:40,marginBottom:4}}>🎯</div><h1 style={{fontFamily:FD,fontSize:22,fontWeight:800,color:textHi,margin:0,letterSpacing:"-0.01em"}}>Dart Turnier</h1><p style={{fontFamily:F,color:textLow,fontSize:11,margin:"4px 0 0",letterSpacing:"0.05em"}}>SETUP</p></div>

      <div style={{background:card,border:`1px solid ${bdr}`,borderRadius:12,padding:16,width:"100%",maxWidth:340,marginBottom:12}}>
        <label htmlFor="cfg-name" style={{fontSize:10,color:textLow}}>Turniername</label>
        <input id="cfg-name" value={config.name} onChange={e=>setConfig(c=>({...c,name:e.target.value}))} style={{width:"100%",background:surf2,border:`1px solid ${bdr}`,borderRadius:6,padding:"8px 10px",color:textHi,fontFamily:F,fontSize:13,marginBottom:8,boxSizing:"border-box"}}/>
        <label htmlFor="cfg-date" style={{fontSize:10,color:textLow}}>Datum</label>
        <input id="cfg-date" value={config.date} onChange={e=>setConfig(c=>({...c,date:e.target.value}))} placeholder="z.B. 19.09.2026" style={{width:"100%",background:surf2,border:`1px solid ${bdr}`,borderRadius:6,padding:"8px 10px",color:textHi,fontFamily:F,fontSize:13,marginBottom:10,boxSizing:"border-box"}}/>

        <span id="teamanzahl-label" style={{fontSize:10,color:textLow,display:"block",marginBottom:4}}>Teamanzahl</span>
        <div role="group" aria-labelledby="teamanzahl-label" style={{display:"flex",gap:6,marginBottom:10}}>
          {TEAM_SIZES.map(s=><button key={s} onClick={()=>updateTeamSize(s)} aria-pressed={config.teamSize===s} style={{flex:1,padding:"8px 0",borderRadius:6,background:config.teamSize===s?greenDark:surf2,border:`1px solid ${config.teamSize===s?greenBdr:bdr}`,color:config.teamSize===s?green:textLow,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:F}}>{s}</button>)}
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
      </div>

      <div style={{background:card,border:`1px solid ${bdr}`,borderRadius:12,padding:16,width:"100%",maxWidth:340,marginBottom:12}}>
        <p style={{color:textLow,fontSize:10,margin:"0 0 8px"}}>{config.teamSize} Teams · je 2 Spieler</p>
        <div style={{maxHeight:240,overflowY:"auto"}}>
          {teamNames.map((name,i)=><div key={i} style={{marginBottom:5,display:"flex",alignItems:"center",gap:6}}>
            <span style={{color:textOff,fontSize:10,width:16,textAlign:"right"}}>{i+1}</span>
            <input value={name} aria-label={`Team ${i+1} Name`} onChange={e=>{const n=[...teamNames];n[i]=e.target.value;setTeamNames(n);}} placeholder={`Team ${i+1}`} style={{flex:1,background:surf2,border:`1px solid ${bdr}`,borderRadius:6,padding:"7px 10px",color:textHi,fontFamily:F,fontSize:12}}/>
          </div>)}
        </div>
        <button onClick={startTournament} style={{width:"100%",marginTop:10,padding:"12px 0",background:green,color:bg,border:"none",borderRadius:8,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:F}}>Turnier starten</button>
      </div>

      <div style={{background:card,border:`1px solid ${bdr}`,borderRadius:10,padding:12,width:"100%",maxWidth:340}}>
        <p style={{color:textLow,fontSize:10,margin:0,lineHeight:1.6}}>
          <span style={{color:greenText}}>Vorrunden:</span> 501 Single Out · Best of {config.legsToWin*2-1}<br/>
          {config.finalDoubleOut&&<><span style={{color:orange}}>Finale:</span> 501 Double Out · Best of {config.legsToWin*2-1}<br/></>}
          {config.thirdPlace&&<><span style={{color:colBlue}}>Platz 3:</span> Verlierer der Halbfinals</>}
        </p>
      </div>
    </div>
  );

  // ── SCORING / TV ──
  if((phase==="scoring"||phase==="tv")&&bracket&&activeMatchId){
    const result=getMatch(bracket,activeMatchId);
    if(!result)return null;
    return<><GlobalStyles/><ScoringView match={result.match} teams={bracket.teams} roundName={result.round.name} isDoubleOut={result.round.isDoubleOut} onBack={back} onUpdate={handleUpdate} isTV={phase==="tv"}/></>;
  }

  // ── STATS ──
  if(phase==="stats"&&bracket)return<><GlobalStyles/><StatsView bracket={bracket} onBack={()=>setPhase("bracket")}/></>;

  // ── SOUNDS ──
  if(phase==="settings")return<><GlobalStyles/><SettingsView sounds={sounds} onSave={(s)=>{setSounds(s);customSounds=s;}} onBack={()=>setPhase("bracket")}/></>;

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
          <div style={{fontFamily:FD,fontSize:18,fontWeight:800,color:textHi,letterSpacing:"-0.01em"}}>{bracket.config.name}</div>
          {bracket.config.date&&<div style={{fontSize:11,color:textLow,marginTop:2}}>{bracket.config.date}</div>}
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>setPhase("stats")} aria-label="Statistiken" style={{background:surf2,border:`1px solid ${bdr}`,color:greenText,borderRadius:6,padding:"7px 12px",cursor:"pointer",fontSize:11}}>Stats</button>
          <button onClick={()=>setPhase("settings")} aria-label="Sounds konfigurieren" style={{background:surf2,border:`1px solid ${bdr}`,color:textLow,borderRadius:6,padding:"7px 12px",cursor:"pointer",fontSize:11}}>Sounds</button>
          <button onClick={()=>setShowHelp(true)} aria-label="Hilfe anzeigen" style={{background:surf2,border:`1px solid ${bdr}`,color:textLow,borderRadius:6,padding:"7px 12px",cursor:"pointer",fontSize:11}}>?</button>
          <button onClick={()=>setConfirmReset(true)} aria-label="Turnier zurücksetzen" style={{background:surf2,border:`1px solid ${bdr}`,color:textLow,borderRadius:6,padding:"7px 12px",cursor:"pointer",fontSize:11}}>Neu</button>
        </div>
      </div>

      {/* ── Bracket rounds (left column on desktop) ── */}
      <div className="bracket-main" style={{overflowX:"auto"}}>
        <div style={{display:"flex",gap:14,minWidth:"fit-content",alignItems:"flex-start"}}>
          {mainRounds.map((round,rIdx)=>(
            <div key={rIdx} style={{display:"flex",flexDirection:"column",gap:10,minWidth:190}}>
              <div style={{textAlign:"center",paddingBottom:4,borderBottom:`1px solid ${bdrSoft}`}}>
                <div style={{fontSize:12,fontWeight:700,color:round.isDoubleOut?orange:green}}>{round.name}</div>
                <div style={{fontSize:10,color:textLow,marginTop:2}}>501 · {round.isDoubleOut?"Double Out":"Single Out"} · Bo{config.legsToWin*2-1}</div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:10,justifyContent:"space-around",minHeight:rIdx===0?"auto":rIdx===mainRounds.length-2?260:280}}>
                {round.matches.map(m=><MatchCard key={m.id} match={m} teams={bracket.teams} onOpen={openMatch} onTV={openTV}/>)}
              </div>
            </div>
          ))}
          {thirdRound&&<div style={{display:"flex",flexDirection:"column",gap:10,minWidth:190}}>
            <div style={{textAlign:"center",paddingBottom:4,borderBottom:`1px solid ${bdrSoft}`}}>
              <div style={{fontSize:12,fontWeight:700,color:colBlue}}>{thirdRound.name}</div>
              <div style={{fontSize:10,color:textLow,marginTop:2}}>501 · {thirdRound.isDoubleOut?"Double Out":"Single Out"} · Bo{config.legsToWin*2-1}</div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:10,justifyContent:"center",minHeight:280}}>
              {thirdRound.matches.map(m=><MatchCard key={m.id} match={m} teams={bracket.teams} onOpen={openMatch} onTV={openTV}/>)}
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
      {confirmReset&&<div style={{position:"fixed",inset:0,background:"oklch(0% 0 0 / 0.72)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setConfirmReset(false)}>
        <div style={{background:card,border:`1px solid ${colRed}`,borderRadius:14,padding:"24px",maxWidth:300,width:"100%",textAlign:"center"}} onClick={e=>e.stopPropagation()}>
          <div style={{fontSize:13,fontWeight:700,color:textHi,marginBottom:8,fontFamily:F}}>Turnier zurücksetzen?</div>
          <div style={{fontSize:11,color:textLow,marginBottom:20,fontFamily:F}}>Alle Ergebnisse und Daten gehen verloren.</div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>setConfirmReset(false)} style={{flex:1,padding:"10px 0",background:surf2,border:`1px solid ${bdr}`,borderRadius:8,color:textMid,fontSize:12,cursor:"pointer",fontFamily:F}}>Abbrechen</button>
            <button onClick={resetTournament} style={{flex:1,padding:"10px 0",background:colRedDk,border:`1px solid ${colRed}`,borderRadius:8,color:colRed,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:F}}>Zurücksetzen</button>
          </div>
        </div>
      </div>}
    </div>
  );
}
