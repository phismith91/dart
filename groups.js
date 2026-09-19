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
