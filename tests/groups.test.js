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
setResult(g2[0], 7, [0,2]); // 4v7 → 7 gewinnt 2:0 (team7: for2/against0)
setResult(g2[2], 4, [2,0]); // 4v6 → 4 gewinnt 2:0 (team6: for0/against2)
setResult(g2[5], 6, [2,0]); // 6v7 → 6 gewinnt 2:0 (team6: for2/against0, team7: for0/against2)
// g2[1] (5v6) und g2[3]/g2[4] bleiben unentschieden (winner:null), zählen nicht.
// Team6: played2 (g2[2] Niederlage, g2[5] Sieg) → won1, for=0+2=2, against=2+0=2, diff=0
// Team7: played2 (g2[0] Sieg, g2[5] Niederlage) → won1, for=2+0=2, against=0+2=2, diff=0
// Exakt gleich bei Siegen UND Legdifferenz → jetzt entscheidet wirklich der direkte
// Vergleich aus g2[5]: 6 hat 7 geschlagen → 6 vor 7.
const table2 = groupStandings(g2, [4,5,6,7]);
const idx6 = table2.findIndex(r=>r.team===6), idx7 = table2.findIndex(r=>r.team===7);
eq(table2[idx6].won, table2[idx7].won, 'Team 6 und Team 7 haben gleich viele Siege');
eq(table2[idx6].legDiff, table2[idx7].legDiff, 'Team 6 und Team 7 haben gleiche Legdifferenz');
eq(table2[idx6].legDiff, 0, 'Legdifferenz ist tatsächlich 0, nicht nur zufällig gleich');
assert(idx6 < idx7, 'bei echtem Gleichstand entscheidet der direkte Vergleich (6 schlug 7) — 6 steht vor 7');

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
