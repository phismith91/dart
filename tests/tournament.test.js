// ═══════════════════════════════════════════
// DartForge Tournament Engine — Test Suite
// ═══════════════════════════════════════════

import {
  generateBracket, reportResult, undoResult, isComplete,
  getPlacements, getAllMatches, getReadyMatches, propagateBracket,
} from '../src/formats/single-elim.js';

import {
  generateGroups, reportGroupResult, undoGroupResult,
  calculateTable, getAdvancingParticipants, isGroupPhaseComplete,
} from '../src/formats/round-robin.js';

import {
  createTournament, startPhase, reportMatchResult, undoMatchResult,
  advancePhase, getCurrentPhase, getReadyMatches as getTournamentReady,
  getAllMatches as getTournamentMatches, getGroupTable, getAllGroupTables,
  isPhaseComplete, getStandings, getSchedule,
} from '../src/tournament.js';

let passed = 0, failed = 0;
const suite = (n) => console.log(`\n─── ${n} ───`);
const assert = (c, t) => { if (c) { passed++; } else { failed++; console.log(`  ❌ ${t}`); } };
const eq = (a, e, t) => { if (a === e) { passed++; } else { failed++; console.log(`  ❌ ${t} — got: ${JSON.stringify(a)}, want: ${JSON.stringify(e)}`); } };

// Helpers
const players = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `Player ${i + 1}` }));
const win = (p, s1 = 2, s2 = 0) => ({ winner: p, score1: s1, score2: s2 });

console.log('\n🎯 DARTFORGE TOURNAMENT ENGINE — TEST SUITE\n');

// ═══════════════════════════════════════════
// SINGLE ELIMINATION — BRACKET GENERATION
// ═══════════════════════════════════════════
suite('Single Elim — 4 Players');
let bracket = generateBracket(players(4));
eq(bracket.rounds.length, 2, '4p: 2 rounds');
eq(bracket.rounds[0].length, 2, '4p: 2 SF matches');
eq(bracket.rounds[1].length, 1, '4p: 1 final');
eq(bracket.rounds[0][0].p1, 'p1', 'Match 1: P1');
eq(bracket.rounds[0][0].p2, 'p4', 'Match 1: P4');
eq(bracket.rounds[0][1].p1, 'p2', 'Match 2: P2');
eq(bracket.rounds[0][1].p2, 'p3', 'Match 2: P3');
eq(bracket.roundNames[0], 'Halbfinale', 'Round 1: Halbfinale');
eq(bracket.roundNames[1], 'Finale', 'Round 2: Finale');

suite('Single Elim — 8 Players');
bracket = generateBracket(players(8));
eq(bracket.rounds.length, 3, '8p: 3 rounds');
eq(bracket.rounds[0].length, 4, '8p: 4 QF matches');
eq(bracket.rounds[1].length, 2, '8p: 2 SF matches');
eq(bracket.rounds[2].length, 1, '8p: 1 final');
eq(bracket.roundNames[0], 'Viertelfinale', 'R1: VF');
eq(bracket.roundNames[2], 'Finale', 'R3: Finale');

suite('Single Elim — 16 Players');
bracket = generateBracket(players(16));
eq(bracket.rounds.length, 4, '16p: 4 rounds');
eq(bracket.rounds[0].length, 8, '16p: 8 first round matches');
eq(bracket.roundNames[0], 'Achtelfinale', 'R1: AF');

suite('Single Elim — Third Place');
bracket = generateBracket(players(4), { thirdPlace: true });
assert(bracket.thirdPlaceMatch !== null, '4p: has 3rd place match');
eq(bracket.thirdPlaceMatch.status, 'pending', '3rd place: pending');
eq(bracket.thirdPlaceMatch.isThirdPlace, true, '3rd place flag');

suite('Single Elim — BYE Handling (6 players)');
bracket = generateBracket(players(6));
eq(bracket.rounds.length, 3, '6p: 3 rounds (padded to 8)');
const byeMatches = bracket.rounds[0].filter(m => m.result?.walkover);
assert(byeMatches.length === 2, '6p: 2 BYE matches');
const r2 = bracket.rounds[1];
assert(r2.some(m => m.p1 !== null || m.p2 !== null), '6p: BYE winners propagated');

suite('Single Elim — 2 Players');
bracket = generateBracket(players(2));
eq(bracket.rounds.length, 1, '2p: 1 round (final only)');
eq(bracket.rounds[0][0].p1, 'p1', '2p: P1');
eq(bracket.rounds[0][0].p2, 'p2', '2p: P2');
eq(bracket.rounds[0][0].status, 'ready', '2p: ready');

// ═══════════════════════════════════════════
// SINGLE ELIMINATION — RESULTS & PROGRESSION
// ═══════════════════════════════════════════
suite('Single Elim — Report Results');
bracket = generateBracket(players(4));
const nm = { p1: 'Player 1', p2: 'Player 2', p3: 'Player 3', p4: 'Player 4' };

// SF1: P1 beats P4 — use returned bracket (pure function)
let res = reportResult(bracket, 'r0m0', win('p1', 2, 1), nm);
bracket = res.bracket;
eq(res.type, 'RESULT_REPORTED', 'SF1 result reported');
eq(bracket.rounds[0][0].status, 'complete', 'SF1 complete');

// SF2: P3 beats P2
res = reportResult(bracket, 'r0m1', win('p3', 2, 0), nm);
bracket = res.bracket;
eq(bracket.rounds[1][0].p1, 'p1', 'Final: P1 propagated');
eq(bracket.rounds[1][0].p2, 'p3', 'Final: P3 propagated');
eq(bracket.rounds[1][0].status, 'ready', 'Final: ready');

// Final: P1 wins
res = reportResult(bracket, 'r1m0', win('p1', 2, 1), nm);
bracket = res.bracket;
assert(isComplete(bracket), 'Tournament complete');

suite('Single Elim — Placements');
const places = getPlacements(bracket);
eq(places[0].place, 1, '1st place');
eq(places[0].id, 'p1', '1st: P1');
eq(places[1].place, 2, '2nd place');
eq(places[1].id, 'p3', '2nd: P3');

suite('Single Elim — Third Place Progression');
bracket = generateBracket(players(4), { thirdPlace: true });
res = reportResult(bracket, 'r0m0', win('p1'), nm);
bracket = res.bracket;
res = reportResult(bracket, 'r0m1', win('p3'), nm);
bracket = res.bracket;
// Third place match should now be ready (P4 vs P2)
eq(bracket.thirdPlaceMatch.p1, 'p4', '3rd place: P4 (loser SF1)');
eq(bracket.thirdPlaceMatch.p2, 'p2', '3rd place: P2 (loser SF2)');
eq(bracket.thirdPlaceMatch.status, 'ready', '3rd place: ready');

res = reportResult(bracket, 'third', win('p2'), nm);
bracket = res.bracket;
res = reportResult(bracket, 'r1m0', win('p1'), nm);
bracket = res.bracket;
const places2 = getPlacements(bracket);
eq(places2[2].place, 3, '3rd place entry');
eq(places2[2].id, 'p2', '3rd: P2');
eq(places2[3].place, 4, '4th place entry');
eq(places2[3].id, 'p4', '4th: P4');

suite('Single Elim — Undo');
bracket = generateBracket(players(4));
res = reportResult(bracket, 'r0m0', win('p1'), nm);
bracket = res.bracket;
res = reportResult(bracket, 'r0m1', win('p3'), nm);
bracket = res.bracket;
eq(bracket.rounds[1][0].status, 'ready', 'Final ready');

// Undo SF1 — use returned bracket
res = undoResult(bracket, 'r0m0', nm);
bracket = res.bracket;
eq(res.type, 'RESULT_UNDONE', 'Undo success');
eq(bracket.rounds[0][0].result, null, 'SF1 result cleared');
eq(bracket.rounds[1][0].p1, null, 'Final P1 cleared');
eq(bracket.rounds[1][0].status, 'pending', 'Final back to pending');

suite('Single Elim — Undo Blocked (downstream)');
bracket = generateBracket(players(4));
res = reportResult(bracket, 'r0m0', win('p1'), nm); bracket = res.bracket;
res = reportResult(bracket, 'r0m1', win('p3'), nm); bracket = res.bracket;
res = reportResult(bracket, 'r1m0', win('p1'), nm); bracket = res.bracket;
// Try to undo SF1 — should fail (final has result)
res = undoResult(bracket, 'r0m0', nm);
eq(res.error, 'DOWNSTREAM_HAS_RESULTS', 'Undo blocked');

suite('Single Elim — Ready & All Matches');
bracket = generateBracket(players(4));
let ready = getReadyMatches(bracket);
eq(ready.length, 2, '2 ready matches (both SFs)');
let all = getAllMatches(bracket);
eq(all.length, 3, '3 total matches');

suite('Single Elim — Error Cases');
bracket = generateBracket(players(4));
res = reportResult(bracket, 'r1m0', win('p1'), nm);
eq(res.error, 'MATCH_NOT_READY', 'Cannot report pending match');
res = reportResult(bracket, 'nonexistent', win('p1'), nm);
eq(res.error, 'MATCH_NOT_FOUND', 'Unknown match ID');

// ═══════════════════════════════════════════
// ROUND ROBIN — GROUP GENERATION
// ═══════════════════════════════════════════
suite('Round Robin — Single Group (4 players)');
let groups = generateGroups(players(4), 1);
eq(groups.groups.length, 1, '1 group');
eq(groups.groups[0].participants.length, 4, '4 in group');
eq(groups.groups[0].matches.length, 6, '4p RR: 6 matches (4C2)');

assert(groups.groups[0].matches.every(m => m.status === 'ready'), 'All ready');
assert(groups.groups[0].matches.every(m => m.p1 && m.p2), 'All have players');

suite('Round Robin — Two Groups (8 players)');
groups = generateGroups(players(8), 2, 'snake');
eq(groups.groups.length, 2, '2 groups');
eq(groups.groups[0].participants.length, 4, 'Group A: 4 players');
eq(groups.groups[1].participants.length, 4, 'Group B: 4 players');
eq(groups.groups[0].matches.length, 6, 'Group A: 6 matches');

const gA = groups.groups[0].participants.map(p => p.id);
const gB = groups.groups[1].participants.map(p => p.id);
assert(gA.includes('p1'), 'Snake: P1 in Group A');
assert(gB.includes('p2'), 'Snake: P2 in Group B');

suite('Round Robin — 3 Players (odd)');
groups = generateGroups(players(3), 1);
eq(groups.groups[0].matches.length, 3, '3p RR: 3 matches');

suite('Round Robin — 4 Groups');
groups = generateGroups(players(16), 4);
eq(groups.groups.length, 4, '4 groups');
eq(groups.groups[0].participants.length, 4, '4 per group');

// ═══════════════════════════════════════════
// ROUND ROBIN — RESULTS & TABLE
// ═══════════════════════════════════════════
suite('Round Robin — Report Results');
groups = generateGroups(players(4), 1);
const m0 = groups.groups[0].matches[0];

res = reportGroupResult(groups, m0.id, win(m0.p1, 2, 1));
groups = res.groupState;
eq(res.type, 'GROUP_RESULT_REPORTED', 'Result reported');
eq(groups.groups[0].matches[0].status, 'complete', 'Match complete');

suite('Round Robin — Table Calculation');
groups = generateGroups([
  { id: 'a', name: 'Alice' }, { id: 'b', name: 'Bob' },
  { id: 'c', name: 'Charlie' }, { id: 'd', name: 'Diana' },
], 1);

// A beats everyone, B beats C&D, C beats D
for (const m of groups.groups[0].matches) {
  let winner;
  const pair = [m.p1, m.p2].sort().join('');
  if (pair === 'ab') winner = 'a';
  else if (pair === 'ac') winner = 'a';
  else if (pair === 'ad') winner = 'a';
  else if (pair === 'bc') winner = 'b';
  else if (pair === 'bd') winner = 'b';
  else if (pair === 'cd') winner = 'c';
  const r = reportGroupResult(groups, m.id, win(winner, 2, 1));
  groups = r.groupState;
}

const table = calculateTable(groups.groups[0]);
eq(table.length, 4, 'Table has 4 rows');
eq(table[0].id, 'a', '1st: Alice (3W)');
eq(table[0].points, 9, 'Alice: 9 points');
eq(table[0].won, 3, 'Alice: 3 wins');
eq(table[1].id, 'b', '2nd: Bob (2W)');
eq(table[1].points, 6, 'Bob: 6 points');
eq(table[2].id, 'c', '3rd: Charlie (1W)');
eq(table[3].id, 'd', '4th: Diana (0W)');
eq(table[3].points, 0, 'Diana: 0 points');

eq(table[0].legsWon, 6, 'Alice: 6 legs won');
eq(table[0].legsLost, 3, 'Alice: 3 legs lost');
eq(table[0].legDiff, 3, 'Alice: +3 leg diff');
eq(table[0].rank, 1, 'Alice: rank 1');

suite('Round Robin — Tiebreak: Leg Difference');
groups = generateGroups([
  { id: 'x', name: 'Xander' }, { id: 'y', name: 'Yara' }, { id: 'z', name: 'Zara' },
], 1);

// X beats Y 2:0, Y beats Z 2:0, Z beats X 2:0 → all 3 points each
for (const m of groups.groups[0].matches) {
  const pair = [m.p1, m.p2].sort().join('');
  let winner, s1, s2;
  if (pair === 'xy') { winner = 'x'; s1 = m.p1 === 'x' ? 2 : 0; s2 = m.p2 === 'x' ? 2 : 0; }
  else if (pair === 'yz') { winner = 'y'; s1 = m.p1 === 'y' ? 2 : 0; s2 = m.p2 === 'y' ? 2 : 0; }
  else if (pair === 'xz') { winner = 'z'; s1 = m.p1 === 'z' ? 2 : 0; s2 = m.p2 === 'z' ? 2 : 0; }
  const r = reportGroupResult(groups, m.id, { winner, score1: s1, score2: s2 });
  groups = r.groupState;
}

const table2 = calculateTable(groups.groups[0]);
eq(table2[0].points, 3, 'All 3 points');
eq(table2[1].points, 3, 'All 3 points');
eq(table2[2].points, 3, 'All 3 points');
eq(table2[0].legDiff, 0, 'All 0 diff (circular)');
assert(table2[0].name <= table2[1].name, 'Alphabetical tiebreak');

suite('Round Robin — Advancing Participants');
groups = generateGroups([
  { id: 'a', name: 'Alice' }, { id: 'b', name: 'Bob' },
  { id: 'c', name: 'Charlie' }, { id: 'd', name: 'Diana' },
  { id: 'e', name: 'Eve' }, { id: 'f', name: 'Frank' },
  { id: 'g', name: 'Grace' }, { id: 'h', name: 'Hugo' },
], 2, 'snake');

for (const group of groups.groups) {
  for (const m of group.matches) {
    const winner = m.p1 < m.p2 ? m.p1 : m.p2;
    const r = reportGroupResult(groups, m.id, win(winner, 2, 1));
    groups = r.groupState;
  }
}

assert(isGroupPhaseComplete(groups), 'All matches complete');
const advancing = getAdvancingParticipants(groups, 2);
eq(advancing.length, 4, '4 advancing (2 per group)');
assert(advancing[0].groupRank === 1, 'First out: rank 1');
assert(advancing[1].groupRank === 1, 'Second out: rank 1');
assert(advancing[2].groupRank === 2, 'Third out: rank 2');

suite('Round Robin — Undo');
groups = generateGroups(players(4), 1);
const firstMatch = groups.groups[0].matches[0];
res = reportGroupResult(groups, firstMatch.id, win(firstMatch.p1));
groups = res.groupState;
eq(groups.groups[0].matches[0].status, 'complete', 'Complete before undo');
res = undoGroupResult(groups, firstMatch.id);
groups = res.groupState;
eq(res.type, 'GROUP_RESULT_UNDONE', 'Undo success');
eq(groups.groups[0].matches[0].result, null, 'Result cleared');
eq(groups.groups[0].matches[0].status, 'ready', 'Back to ready');

// ═══════════════════════════════════════════
// TOURNAMENT ENGINE — SINGLE PHASE
// ═══════════════════════════════════════════
suite('Tournament — Create');
let tournament = createTournament({
  name: 'Test Turnier',
  date: '2026-09-19',
  participants: players(8),
  phases: [{ name: 'KO-Runde', format: 'single_elim', thirdPlace: true }],
});
eq(tournament.status, 'setup', 'Status: setup');
eq(tournament.phases.length, 1, '1 phase');
eq(tournament.phases[0].status, 'setup', 'Phase: setup');
eq(tournament.eventLog.length, 1, '1 log entry');
eq(tournament.eventLog[0].type, 'TOURNAMENT_CREATED', 'Log: created');

suite('Tournament — Start Phase');
res = startPhase(tournament);
tournament = res.state;
eq(res.result.type, 'PHASE_STARTED', 'Phase started');
eq(tournament.status, 'running', 'Status: running');
eq(tournament.phases[0].status, 'running', 'Phase: running');
assert(tournament.phases[0].data.bracket !== undefined, 'Bracket generated');
eq(tournament.eventLog.length, 2, '2 log entries');

suite('Tournament — Report Match');
ready = getTournamentReady(tournament);
eq(ready.length, 4, '4 ready matches');
const firstReady = ready[0];
res = reportMatchResult(tournament, firstReady.id, win(firstReady.p1));
tournament = res.state;
eq(res.result.type, 'RESULT_REPORTED', 'Result reported');
eq(tournament.eventLog.length, 3, '3 log entries');

suite('Tournament — Play Full KO');
ready = getTournamentReady(tournament);
for (const m of ready) {
  if (m.round === 0) {
    res = reportMatchResult(tournament, m.id, win(m.p1));
    tournament = res.state;
  }
}

ready = getTournamentReady(tournament);
for (const m of ready) {
  if (m.round === 1) {
    res = reportMatchResult(tournament, m.id, win(m.p1));
    tournament = res.state;
  }
}

ready = getTournamentReady(tournament);
for (const m of ready) {
  res = reportMatchResult(tournament, m.id, win(m.p1));
  tournament = res.state;
}

assert(isPhaseComplete(tournament), 'Phase complete');

suite('Tournament — Advance (single phase = tournament complete)');
res = advancePhase(tournament);
tournament = res.state;
eq(res.result.type, 'TOURNAMENT_COMPLETE', 'Tournament complete');
eq(tournament.status, 'complete', 'Status: complete');

// ═══════════════════════════════════════════
// TOURNAMENT ENGINE — MULTI-PHASE (Groups → KO)
// ═══════════════════════════════════════════
suite('Tournament — Groups + KO');
tournament = createTournament({
  name: 'Vereinsmeisterschaft',
  date: '2026-09-19',
  participants: players(8),
  phases: [
    { name: 'Gruppenphase', format: 'round_robin', groups: 2, advanceCount: 2, seeding: 'snake' },
    { name: 'KO-Phase', format: 'single_elim', thirdPlace: true },
  ],
});

eq(tournament.phases.length, 2, '2 phases');
eq(tournament.phases[1].status, 'pending', 'Phase 2: pending');

res = startPhase(tournament);
tournament = res.state;
eq(tournament.phases[0].status, 'running', 'Groups running');
eq(tournament.phases[0].data.format, 'round_robin', 'Format: RR');
eq(tournament.phases[0].data.groups.length, 2, '2 groups');

let tables = getAllGroupTables(tournament);
eq(tables.length, 2, '2 tables');
eq(tables[0].groupName, 'Gruppe A', 'Group A');
eq(tables[1].groupName, 'Gruppe B', 'Group B');

let allGroupMatches = getTournamentMatches(tournament);
for (const m of allGroupMatches) {
  const winner = m.p1 < m.p2 ? m.p1 : m.p2;
  res = reportMatchResult(tournament, m.id, win(winner, 2, 1));
  tournament = res.state;
}

assert(isPhaseComplete(tournament), 'Group phase complete');

const tableA = getGroupTable(tournament, 0);
assert(tableA !== null, 'Table A exists');
eq(tableA.length, 4, 'Table A: 4 rows');

suite('Tournament — Advance to KO');
res = advancePhase(tournament);
tournament = res.state;
eq(tournament.currentPhase, 1, 'Now in phase 1');
eq(tournament.phases[0].status, 'complete', 'Groups complete');
eq(tournament.phases[1].status, 'running', 'KO running');
eq(tournament.phases[1].data.format, 'single_elim', 'Format: SE');

assert(tournament.phases[1].data.bracket !== undefined, 'KO bracket exists');
const koMatches = getTournamentReady(tournament);
eq(koMatches.length, 2, '2 SF matches (4 players)');

for (const m of koMatches) {
  res = reportMatchResult(tournament, m.id, win(m.p1));
  tournament = res.state;
}

ready = getTournamentReady(tournament);
for (const m of ready) {
  res = reportMatchResult(tournament, m.id, win(m.p1));
  tournament = res.state;
}

assert(isPhaseComplete(tournament), 'KO complete');
res = advancePhase(tournament);
tournament = res.state;
eq(tournament.status, 'complete', 'Tournament complete');

suite('Tournament — Final Standings');
const standings = getStandings(tournament);
assert(standings !== null, 'Standings exist');
eq(standings[0].place, 1, 'Has 1st place');

suite('Tournament — Event Log');
assert(tournament.eventLog.length > 5, 'Many log entries');
const logTypes = tournament.eventLog.map(e => e.type);
assert(logTypes.includes('TOURNAMENT_CREATED'), 'Log: created');
assert(logTypes.includes('PHASE_STARTED'), 'Log: phase started');
assert(logTypes.includes('MATCH_RESULT'), 'Log: match result');
assert(logTypes.includes('PHASE_ADVANCED'), 'Log: phase advanced');
assert(logTypes.includes('TOURNAMENT_COMPLETE'), 'Log: complete');

// ═══════════════════════════════════════════
// TOURNAMENT — UNDO
// ═══════════════════════════════════════════
suite('Tournament — Undo Match');
tournament = createTournament({
  name: 'Undo Test',
  participants: players(4),
  phases: [{ name: 'KO', format: 'single_elim' }],
});
res = startPhase(tournament);
tournament = res.state;
ready = getTournamentReady(tournament);
res = reportMatchResult(tournament, ready[0].id, win(ready[0].p1));
tournament = res.state;

res = undoMatchResult(tournament, ready[0].id);
tournament = res.state;
eq(res.result.type, 'RESULT_UNDONE', 'Undo in tournament');
const logUndo = tournament.eventLog.filter(e => e.type === 'MATCH_UNDO');
eq(logUndo.length, 1, 'Undo logged');

// ═══════════════════════════════════════════
// TOURNAMENT — SCHEDULING / BOARDS
// ═══════════════════════════════════════════
suite('Tournament — Board Assignment');
tournament = createTournament({
  name: 'Multi-Board',
  participants: players(8),
  phases: [{ name: 'KO', format: 'single_elim' }],
  boards: ['Board 1', 'Board 2'],
});
res = startPhase(tournament);
tournament = res.state;
const schedule = getSchedule(tournament);
eq(schedule.length, 4, '4 matches scheduled');
eq(schedule[0].board, 'Board 1', 'M1: Board 1');
eq(schedule[1].board, 'Board 2', 'M2: Board 2');
eq(schedule[2].board, 'Board 1', 'M3: Board 1 (wrap)');

suite('Tournament — No Boards');
tournament = createTournament({
  name: 'No Boards',
  participants: players(4),
  phases: [{ name: 'KO', format: 'single_elim' }],
});
res = startPhase(tournament);
tournament = res.state;
const sched2 = getSchedule(tournament);
eq(sched2[0].board, null, 'No board assigned');

// ═══════════════════════════════════════════
// EDGE CASES
// ═══════════════════════════════════════════
suite('Edge Cases');
// Can't advance incomplete phase
tournament = createTournament({
  name: 'Test',
  participants: players(4),
  phases: [{ name: 'KO', format: 'single_elim' }],
});
res = startPhase(tournament);
tournament = res.state;
res = advancePhase(tournament);
eq(res.result.error, 'PHASE_NOT_COMPLETE', 'Cant advance incomplete');

// Can't start already running phase
res = startPhase(tournament);
eq(res.result.error, 'PHASE_ALREADY_STARTED', 'Cant restart');

// Can't report on non-running phase
tournament = createTournament({
  name: 'Test',
  participants: players(4),
  phases: [{ name: 'KO', format: 'single_elim' }],
});
res = reportMatchResult(tournament, 'r0m0', win('p1'));
eq(res.result.error, 'PHASE_NOT_RUNNING', 'Cant report before start');

// Minimum validation — returns { error } instead of throwing
let invalid = createTournament({ participants: [{ id: 'p1', name: 'P1' }], phases: [{ name: 'X', format: 'single_elim' }] });
assert(invalid.error === 'NEED_TWO_PARTICIPANTS', '1 participant returns error');

invalid = createTournament({ participants: players(4), phases: [] });
assert(invalid.error === 'NEED_ONE_PHASE', '0 phases returns error');

// ═══════════════════════════════════════════
// ROUND ROBIN — PARTIAL TABLE
// ═══════════════════════════════════════════
suite('Table — Partial Results');
groups = generateGroups(players(4), 1);
const partialMatch = groups.groups[0].matches[0];
res = reportGroupResult(groups, partialMatch.id, win(partialMatch.p1, 2, 0));
groups = res.groupState;
const partialTable = calculateTable(groups.groups[0]);
eq(partialTable.length, 4, 'Table has all players');
assert(partialTable.some(r => r.played === 1), 'Some played');
assert(partialTable.some(r => r.played === 0), 'Some not played');
assert(!isGroupPhaseComplete(groups), 'Not complete');

// ═══════════════════════════════════════════
// RESULT
// ═══════════════════════════════════════════
console.log(`\n${'═'.repeat(50)}`);
console.log(`🎯 RESULT: ${passed} passed, ${failed} failed (${passed + failed} total)`);
console.log(`${'═'.repeat(50)}\n`);
process.exit(failed > 0 ? 1 : 0);
