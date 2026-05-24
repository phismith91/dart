// ═══════════════════════════════════════════
// DartForge Logger — Test Suite
// ═══════════════════════════════════════════

import {
  createGame, throwDarts, throwTotal, bullOffThrow, setStarter,
  undoTurn, undoLeg, getLog, exportJSON, generateMatchReport,
  getStats,
} from '../src/logger.js';

import { Phase } from '../src/types.js';

let passed = 0, failed = 0;
const suite = (n) => console.log(`\n─── ${n} ───`);
const assert = (c, t) => { if (c) { passed++; } else { failed++; console.log(`  ❌ ${t}`); } };
const eq = (a, e, t) => { if (a === e) { passed++; } else { failed++; console.log(`  ❌ ${t} — got: ${JSON.stringify(a)}, want: ${JSON.stringify(e)}`); } };

const S = (f) => ({ field: f, multiplier: 'S' });
const D = (f) => ({ field: f, multiplier: 'D' });
const T = (f) => ({ field: f, multiplier: 'T' });
const MISS = { field: 0, multiplier: 'S' };
const BULL = D(25);
const SBULL = S(25);

console.log('\n🎯 DARTFORGE LOGGER — TEST SUITE\n');

// ═══════════════════════════════════════════
// LOG CREATION
// ═══════════════════════════════════════════
suite('Log Initialization');
let state = createGame({ startScore: 501, checkoutMode: 'double', legsToWin: 3 });
let log = getLog(state);
eq(log.length, 1, 'Initial log has 1 entry');
eq(log[0].type, 'GAME_CREATED', 'First event: GAME_CREATED');
assert(log[0].ts !== undefined, 'Has timestamp');
assert(log[0].seq === 0, 'Seq starts at 0');
eq(log[0].data.config.startScore, 501, 'Config logged');

// ═══════════════════════════════════════════
// SCORE LOGGING
// ═══════════════════════════════════════════
suite('Score Events');
let res = throwDarts(state, [T(20), T(20), T(20)]); // 180
state = res.state;
log = getLog(state);
eq(log.length, 2, '2 entries after 180');
eq(log[1].type, 'SCORE', 'Type: SCORE');
eq(log[1].player, 0, 'Player 0');
eq(log[1].data.total, 180, 'Total: 180');
eq(log[1].data.remaining, 321, 'Remaining: 321');
eq(log[1].data.darts.length, 3, '3 darts logged');
eq(log[1].data.darts[0].label, 'T20', 'Dart 1: T20');
eq(log[1].data.darts[0].value, 60, 'Dart 1 value: 60');
assert(log[1].snapshot.scores[0] === 321, 'Snapshot scores');

suite('Score via Total');
res = throwTotal(state, 100); // P2
state = res.state;
log = getLog(state);
eq(log.length, 3, '3 entries');
eq(log[2].type, 'SCORE', 'Type: SCORE');
eq(log[2].player, 1, 'Player 1');
eq(log[2].data.total, 100, 'Total: 100');
eq(log[2].data.remaining, 401, 'Remaining: 401');

// ═══════════════════════════════════════════
// BUST LOGGING
// ═══════════════════════════════════════════
suite('Bust Events');
state = createGame({ startScore: 50, checkoutMode: 'double', legsToWin: 1 });
res = throwDarts(state, [T(20)]); // 60 > 50 → bust
state = res.state;
log = getLog(state);
const bustEntry = log[log.length - 1];
eq(bustEntry.type, 'BUST', 'Type: BUST');
eq(bustEntry.data.reason, 'BELOW_ZERO', 'Reason logged');
eq(bustEntry.data.remaining, 50, 'Remaining before bust');

suite('Bust — Not Double Checkout');
state = createGame({ startScore: 40, checkoutMode: 'double', legsToWin: 1 });
res = throwDarts(state, [S(20), S(20)]); // 40 but last dart is single
state = res.state;
log = getLog(state);
eq(log[log.length - 1].type, 'BUST', 'Bust type');
eq(log[log.length - 1].data.reason, 'NOT_DOUBLE_CHECKOUT', 'Reason: not double');

// ═══════════════════════════════════════════
// LEG / SET / MATCH WON LOGGING
// ═══════════════════════════════════════════
suite('Leg Won Event');
state = createGame({ startScore: 40, checkoutMode: 'double', legsToWin: 2 });
res = throwDarts(state, [D(20)]); // P1 wins leg
state = res.state;
log = getLog(state);
const legEntry = log[log.length - 1];
eq(legEntry.type, 'LEG_WON', 'Type: LEG_WON');
eq(legEntry.player, 0, 'Winner: P1');
eq(legEntry.data.checkout, 40, 'Checkout: 40');
assert(legEntry.data.legResult !== null, 'Leg result included');
eq(legEntry.data.legResult.winner, 0, 'Leg result winner');

suite('Match Won Event');
// P2 throws, P1 wins again
res = throwTotal(state, 20); // P2
res = throwDarts(res.state, [D(20)]); // P1 wins leg 2 → match
state = res.state;
log = getLog(state);
const matchEntry = log[log.length - 1];
eq(matchEntry.type, 'MATCH_WON', 'Type: MATCH_WON');
eq(matchEntry.player, 0, 'Match winner: P1');

suite('Set Won Event');
state = createGame({ startScore: 40, checkoutMode: 'double', setsToWin: 2, legsPerSet: 1 });
res = throwDarts(state, [D(20)]); // P1 wins leg → set won
state = res.state;
log = getLog(state);
eq(log[log.length - 1].type, 'SET_WON', 'Type: SET_WON');
assert(log[log.length - 1].data.setResult !== undefined, 'Set result included');

// ═══════════════════════════════════════════
// BULL-OFF LOGGING
// ═══════════════════════════════════════════
suite('Bull-Off Events');
state = createGame({ bullOff: true, startScore: 40, checkoutMode: 'double', legsToWin: 1 });
res = bullOffThrow(state, 0, SBULL);
state = res.state;
log = getLog(state);
eq(log[log.length - 1].type, 'BULL_OFF_THROW', 'Bull-off throw logged');
eq(log[log.length - 1].player, 0, 'Player 0');
eq(log[log.length - 1].data.dart.label, 'S-Bull', 'Dart label');

res = bullOffThrow(state, 1, S(20));
state = res.state;
log = getLog(state);
eq(log[log.length - 1].type, 'BULL_OFF_WON', 'Bull-off won logged');
eq(log[log.length - 1].data.winner, 0, 'Winner: P1 (closer)');
assert(log[log.length - 1].data.throws.length === 2, 'Both throws in data');

suite('Bull-Off Tie');
state = createGame({ bullOff: true });
res = bullOffThrow(state, 0, SBULL);
res = bullOffThrow(res.state, 1, SBULL);
log = getLog(res.state);
eq(log[log.length - 1].type, 'BULL_OFF_TIE', 'Tie logged');

// ═══════════════════════════════════════════
// UNDO LOGGING
// ═══════════════════════════════════════════
suite('Undo Events');
state = createGame({});
res = throwTotal(state, 100);
res = undoTurn(res.state);
state = res.state;
log = getLog(state);
const undoEntry = log[log.length - 1];
eq(undoEntry.type, 'UNDO_TURN', 'Undo turn logged');
eq(undoEntry.data.undoneScore, 100, 'Undone score: 100');
eq(undoEntry.data.wasBust, false, 'Was not bust');

suite('Undo Leg');
state = createGame({ startScore: 40, checkoutMode: 'double', legsToWin: 2 });
res = throwDarts(state, [D(20)]);
res = undoLeg(res.state);
log = getLog(res.state);
eq(log[log.length - 1].type, 'UNDO_LEG', 'Undo leg logged');

// ═══════════════════════════════════════════
// STARTER SET LOGGING
// ═══════════════════════════════════════════
suite('Starter Set Event');
state = createGame({ bullOff: true });
res = setStarter(state, 1);
log = getLog(res.state);
eq(log[log.length - 1].type, 'STARTER_SET', 'Starter set logged');
eq(log[log.length - 1].player, 1, 'Player 1 set as starter');

// ═══════════════════════════════════════════
// SEQUENTIAL IDS & TIMESTAMPS
// ═══════════════════════════════════════════
suite('Sequential IDs');
state = createGame({ startScore: 501, checkoutMode: 'single', legsToWin: 1 });
res = throwTotal(state, 100);
res = throwTotal(res.state, 80);
res = throwTotal(res.state, 60);
log = getLog(res.state);
for (let i = 1; i < log.length; i++) {
  assert(log[i].seq > log[i - 1].seq, `Seq ${log[i].seq} > ${log[i - 1].seq}`);
}

suite('Timestamps Present');
for (const entry of log) {
  assert(entry.ts && entry.ts.length > 0, `Entry ${entry.seq} has timestamp`);
  assert(!isNaN(Date.parse(entry.ts)), `Entry ${entry.seq} valid ISO date`);
}

// ═══════════════════════════════════════════
// SNAPSHOTS
// ═══════════════════════════════════════════
suite('State Snapshots');
state = createGame({ startScore: 501 });
res = throwTotal(state, 100); // P1: 401
log = getLog(res.state);
eq(log[log.length - 1].snapshot.scores[0], 401, 'Snapshot: P1 at 401');
eq(log[log.length - 1].snapshot.scores[1], 501, 'Snapshot: P2 at 501');
eq(log[log.length - 1].snapshot.phase, 'awaiting_throw', 'Snapshot: phase');

// ═══════════════════════════════════════════
// JSON EXPORT
// ═══════════════════════════════════════════
suite('JSON Export');
state = createGame({ startScore: 40, checkoutMode: 'double', legsToWin: 1 });
res = throwDarts(state, [D(20)]); // P1 wins
const json = exportJSON(res.state);
assert(typeof json === 'string', 'JSON is string');
const parsed = JSON.parse(json);
assert(parsed.config !== undefined, 'Has config');
assert(parsed.events !== undefined, 'Has events');
assert(parsed.stats !== undefined, 'Has stats');
eq(parsed.winner, 0, 'Winner in export');
assert(parsed.events.length >= 2, 'Events in export');

// ═══════════════════════════════════════════
// MATCH REPORT
// ═══════════════════════════════════════════
suite('Match Report Generation');
state = createGame({ startScore: 170, checkoutMode: 'double', legsToWin: 2 });
// Leg 1: P1 wins (T20 T20 Bull)
res = throwTotal(state, 100);  // P1: 70
res = throwTotal(res.state, 80);   // P2: 90
res = throwDarts(res.state, [T(20), D(5)]); // P1: 70 checkout
// Leg 2: P2 wins
res = throwTotal(res.state, 120); // P2: 50
res = throwTotal(res.state, 100); // P1: 170 (reset)
res = throwDarts(res.state, [S(10), D(20)]); // P2: 50 checkout
// Leg 3: P1 wins
res = throwDarts(res.state, [T(20), T(20), D(25)]); // P1: 170 checkout!
state = res.state;

const report = generateMatchReport(state, ['Alice', 'Bob']);
assert(typeof report === 'string', 'Report is string');
assert(report.includes('MATCH REPORT'), 'Has header');
assert(report.includes('Alice'), 'Has player name');
assert(report.includes('Bob'), 'Has player name 2');
assert(report.includes('SIEGER'), 'Has winner section');
assert(report.includes('Statistiken'), 'Has stats section');
assert(report.includes('Leg-Verlauf'), 'Has leg history');
assert(report.includes('Checkout'), 'Has checkout info');
assert(report.includes('DartForge Engine'), 'Has footer');

// Print sample report
console.log('\n─── SAMPLE REPORT ───');
console.log(report);

// ═══════════════════════════════════════════
// FULL GAME WITH ALL LOGGING
// ═══════════════════════════════════════════
suite('Full Game Log Integrity');
state = createGame({ bullOff: true, startScore: 40, checkoutMode: 'double', legsToWin: 2, timeLimitSeconds: 300 });

// Bull-off
res = bullOffThrow(state, 0, BULL);
res = bullOffThrow(res.state, 1, S(20));
state = res.state;

// Leg 1: P1 wins
res = throwDarts(state, [D(20)]);
state = res.state;

// Leg 2: P2 starts, P2 busts, P1 wins
res = throwTotal(state, 60); // P2 busts (60>40)
res = throwDarts(res.state, [D(20)]); // P1 wins match
state = res.state;

log = getLog(state);
const types = log.map(e => e.type);

assert(types.includes('GAME_CREATED'), 'Log has GAME_CREATED');
assert(types.includes('BULL_OFF_THROW'), 'Log has BULL_OFF_THROW');
assert(types.includes('BULL_OFF_WON'), 'Log has BULL_OFF_WON');
assert(types.includes('LEG_WON'), 'Log has LEG_WON');
assert(types.includes('BUST'), 'Log has BUST');
assert(types.includes('MATCH_WON'), 'Log has MATCH_WON');

// Every event has required fields
for (const e of log) {
  assert(e.seq !== undefined, `Event ${e.seq}: has seq`);
  assert(e.ts !== undefined, `Event ${e.seq}: has ts`);
  assert(e.type !== undefined, `Event ${e.seq}: has type`);
  assert(e.snapshot !== undefined, `Event ${e.seq}: has snapshot`);
}

// Log is append-only (seq always increases)
for (let i = 1; i < log.length; i++) {
  assert(log[i].seq > log[i - 1].seq, `Seq monotonic at ${i}`);
}

// JSON export works on complete game
const fullJson = exportJSON(state);
const fullParsed = JSON.parse(fullJson);
eq(fullParsed.winner, 0, 'Full export: winner');
assert(fullParsed.events.length === log.length, 'Full export: all events');

// Report works on complete game
const fullReport = generateMatchReport(state, ['Marco', 'Sandra']);
assert(fullReport.includes('Marco'), 'Full report: has names');
assert(fullReport.includes('SIEGER'), 'Full report: has winner');

// ═══════════════════════════════════════════
// ERROR CASES DON'T ADD LOG ENTRIES
// ═══════════════════════════════════════════
suite('Errors Not Logged');
state = createGame({});
const logBefore = getLog(state).length;
res = throwTotal(state, 200); // invalid
eq(getLog(res.state).length, logBefore, 'Invalid throw: no log entry');
res = throwTotal(state, 163); // impossible
eq(getLog(res.state).length, logBefore, 'Impossible score: no log entry');
res = undoTurn(state); // nothing to undo
eq(getLog(res.state).length, logBefore, 'Failed undo: no log entry');

// ═══════════════════════════════════════════
// RESULT
// ═══════════════════════════════════════════
console.log(`\n${'═'.repeat(50)}`);
console.log(`🎯 RESULT: ${passed} passed, ${failed} failed (${passed + failed} total)`);
console.log(`${'═'.repeat(50)}\n`);
process.exit(failed > 0 ? 1 : 0);
