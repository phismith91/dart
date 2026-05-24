// ═══════════════════════════════════════════
// DartForge Rules Engine — Test Suite
// ═══════════════════════════════════════════

import {
  dartValue, isValidDart, isDouble, isMaster, dartLabel, bullDistance,
  defaultConfig, IMPOSSIBLE_TOTALS, SINGLE_DART_VALUES, CheckoutMode, Phase, DecidingLeg,
} from '../src/types.js';
import { getCheckout, isValidCheckoutDart, isCheckable } from '../src/checkouts.js';
import {
  createGame, throwDarts, throwTotal, undoTurn, undoLeg, getStats, getCheckoutSuggestion,
  bullOffThrow, setStarter, startTimer, checkTimer,
} from '../src/engine.js';

let passed = 0, failed = 0, suiteName = '';
const suite = (n) => { suiteName = n; console.log(`\n─── ${n} ───`); };
const assert = (c, t) => { if (c) { passed++; } else { failed++; console.log(`  ❌ ${t}`); } };
const eq = (a, e, t) => { if (a === e) { passed++; } else { failed++; console.log(`  ❌ ${t} — got: ${a}, want: ${e}`); } };
const neq = (a, e, t) => { if (a !== e) { passed++; } else { failed++; console.log(`  ❌ ${t} — should not be ${a}`); } };

// Helpers
const S = (f) => ({ field: f, multiplier: 'S' });
const D = (f) => ({ field: f, multiplier: 'D' });
const T = (f) => ({ field: f, multiplier: 'T' });
const MISS = { field: 0, multiplier: 'S' };
const BULL = D(25);
const SBULL = S(25);

console.log('\n🎯 DARTFORGE RULES ENGINE — TEST SUITE\n');

// ═══════════════════════════════════════════
// TYPES & DART VALUES
// ═══════════════════════════════════════════
suite('Dart Values');
eq(dartValue(20, 'S'), 20, 'S20=20');
eq(dartValue(20, 'D'), 40, 'D20=40');
eq(dartValue(20, 'T'), 60, 'T20=60');
eq(dartValue(1, 'S'), 1, 'S1=1');
eq(dartValue(1, 'D'), 2, 'D1=2');
eq(dartValue(1, 'T'), 3, 'T1=3');
eq(dartValue(19, 'T'), 57, 'T19=57');
eq(dartValue(25, 'S'), 25, 'S-Bull=25');
eq(dartValue(25, 'D'), 50, 'D-Bull=50');
eq(dartValue(0, 'S'), 0, 'Miss=0');
eq(dartValue(16, 'T'), 48, 'T16=48');

suite('Dart Validation');
assert(isValidDart(20, 'S'), 'S20 valid');
assert(isValidDart(20, 'D'), 'D20 valid');
assert(isValidDart(20, 'T'), 'T20 valid');
assert(isValidDart(25, 'S'), 'S-Bull valid');
assert(isValidDart(25, 'D'), 'D-Bull valid');
assert(!isValidDart(25, 'T'), 'T-Bull invalid');
assert(isValidDart(0, 'S'), 'Miss valid');
assert(!isValidDart(21, 'S'), '21 invalid');
assert(!isValidDart(-1, 'S'), '-1 invalid');
assert(!isValidDart(20, 'X'), 'bad multiplier invalid');

suite('Dart Labels');
eq(dartLabel(20, 'T'), 'T20', 'T20 label');
eq(dartLabel(25, 'D'), 'Bull', 'Bull label');
eq(dartLabel(25, 'S'), 'S-Bull', 'S-Bull label');
eq(dartLabel(0, 'S'), 'Miss', 'Miss label');
eq(dartLabel(16, 'D'), 'D16', 'D16 label');

suite('Double/Master Detection');
assert(isDouble(20, 'D'), 'D20 is double');
assert(!isDouble(20, 'S'), 'S20 not double');
assert(!isDouble(20, 'T'), 'T20 not double');
assert(isMaster(20, 'D'), 'D20 is master');
assert(isMaster(20, 'T'), 'T20 is master');
assert(!isMaster(20, 'S'), 'S20 not master');

suite('Impossible Scores');
const allDartVals = [...SINGLE_DART_VALUES];
const possible3 = new Set();
for (const a of allDartVals) for (const b of allDartVals) for (const c of allDartVals) possible3.add(a + b + c);
const actualImp = [];
for (let i = 0; i <= 180; i++) if (!possible3.has(i)) actualImp.push(i);
eq(JSON.stringify(actualImp), JSON.stringify([163,166,169,172,173,175,176,178,179]), 'Correct impossible set');
for (let i = 0; i <= 162; i++) assert(!IMPOSSIBLE_TOTALS.has(i), `${i} not impossible`);

// ═══════════════════════════════════════════
// CHECKOUTS
// ═══════════════════════════════════════════
suite('Checkouts — Double Out');
eq(getCheckout(170, 'double')?.path, 'T20 T20 Bull', '170 DO');
eq(getCheckout(160, 'double')?.path, 'T20 T20 D20', '160 DO');
eq(getCheckout(100, 'double')?.path, 'T20 D20', '100 DO');
eq(getCheckout(80, 'double')?.path, 'T20 D10', '80 DO');
eq(getCheckout(40, 'double')?.path, 'D20', '40 DO');
eq(getCheckout(2, 'double')?.path, 'D1', '2 DO');
eq(getCheckout(1, 'double'), null, '1 DO: impossible');
eq(getCheckout(171, 'double'), null, '171 DO: over max');
eq(getCheckout(0, 'double'), null, '0: no checkout');

suite('Checkouts — Single Out');
eq(getCheckout(20, 'single')?.path, 'S20', '20 SO');
eq(getCheckout(1, 'single')?.path, 'S1', '1 SO');
eq(getCheckout(60, 'single')?.path, 'S60', '60 SO');

suite('Checkout Validation');
assert(isValidCheckoutDart(20, 'D', 'double'), 'D20 valid DO checkout');
assert(!isValidCheckoutDart(20, 'S', 'double'), 'S20 invalid DO checkout');
assert(!isValidCheckoutDart(20, 'T', 'double'), 'T20 invalid DO checkout');
assert(isValidCheckoutDart(20, 'S', 'single'), 'S20 valid SO checkout');
assert(isValidCheckoutDart(20, 'D', 'master'), 'D20 valid MO checkout');
assert(isValidCheckoutDart(20, 'T', 'master'), 'T20 valid MO checkout');
assert(!isValidCheckoutDart(20, 'S', 'master'), 'S20 invalid MO checkout');

// ═══════════════════════════════════════════
// GAME CREATION
// ═══════════════════════════════════════════
suite('Game Creation');
const g1 = createGame({});
eq(g1.config.startScore, 501, 'Default 501');
eq(g1.config.checkoutMode, 'double', 'Default DO');
eq(g1.config.legsToWin, 3, 'Default BO5 (FT3)');
eq(g1.config.playerCount, 2, 'Default 2 players');
eq(g1.phase, Phase.AWAITING_THROW, 'Initial phase');
eq(g1.scores[0], 501, 'P1 starts at 501');
eq(g1.scores[1], 501, 'P2 starts at 501');
eq(g1.currentPlayer, 0, 'P1 starts');
eq(g1.winner, null, 'No winner');

const g2 = createGame({ startScore: 301, checkoutMode: 'single', legsToWin: 2 });
eq(g2.config.startScore, 301, 'Custom 301');
eq(g2.config.checkoutMode, 'single', 'Custom SO');
eq(g2.scores[0], 301, 'P1 starts 301');

const g3 = createGame({ setsToWin: 3, legsPerSet: 3 });
eq(g3.sets.length, 2, 'Sets array exists');
eq(g3.sets[0], 0, 'Sets start at 0');

// ═══════════════════════════════════════════
// THROWING — DART-BY-DART
// ═══════════════════════════════════════════
suite('Throw Darts — Basic');
let state = createGame({ startScore: 501, checkoutMode: 'double', legsToWin: 3 });

// P1 throws T20, T20, T20 = 180
let res = throwDarts(state, [T(20), T(20), T(20)]);
eq(res.result.type, 'SCORE', '180: SCORE result');
eq(res.state.scores[0], 321, '501-180=321');
eq(res.state.currentPlayer, 1, 'P2 next');
eq(res.state.turns.length, 1, '1 turn recorded');

// P2 throws S20, S5, S1 = 26
res = throwDarts(res.state, [S(20), S(5), S(1)]);
eq(res.state.scores[1], 475, '501-26=475');
eq(res.state.currentPlayer, 0, 'P1 next');

suite('Throw Darts — Bust (below zero)');
state = createGame({ startScore: 50, checkoutMode: 'double', legsToWin: 1 });
res = throwDarts(state, [T(20), S(0), S(0)]); // 60 > 50
eq(res.result.type, 'BUST', 'Bust below zero');
eq(res.result.reason, 'BELOW_ZERO', 'Reason: below zero');
eq(res.state.scores[0], 50, 'Score unchanged after bust');
eq(res.state.currentPlayer, 1, 'Next player after bust');

suite('Throw Darts — Bust (Double Out, rest=1)');
state = createGame({ startScore: 41, checkoutMode: 'double', legsToWin: 1 });
res = throwDarts(state, [D(20), S(0), S(0)]); // 40, rest=1
eq(res.result.type, 'BUST', 'Bust rest=1 DO');
eq(res.result.reason, 'NO_DOUBLE_FINISH', 'Reason: no double finish');

suite('Throw Darts — Bust (not double checkout)');
state = createGame({ startScore: 40, checkoutMode: 'double', legsToWin: 1 });
res = throwDarts(state, [S(20), S(20), S(0)]); // 40 but last dart is single
eq(res.result.type, 'BUST', 'Bust: not double checkout');
eq(res.result.reason, 'NOT_DOUBLE_CHECKOUT', 'Reason: not double');

suite('Throw Darts — Valid Double Checkout');
state = createGame({ startScore: 40, checkoutMode: 'double', legsToWin: 1 });
res = throwDarts(state, [D(20)]); // 40 with D20
eq(res.result.type, 'MATCH_WON', 'D20 on 40: match won');
eq(res.state.winner, 0, 'P1 wins');
eq(res.state.phase, Phase.MATCH_COMPLETE, 'Match complete');

suite('Throw Darts — Single Out Checkout');
state = createGame({ startScore: 20, checkoutMode: 'single', legsToWin: 1 });
res = throwDarts(state, [S(20)]); // S20 on 20 — valid in SO
eq(res.result.type, 'MATCH_WON', 'S20 on 20 SO: match won');

suite('Throw Darts — Master Out Checkout');
state = createGame({ startScore: 60, checkoutMode: 'master', legsToWin: 1 });
res = throwDarts(state, [T(20)]); // T20 on 60 — valid in MO
eq(res.result.type, 'MATCH_WON', 'T20 on 60 MO: match won');

state = createGame({ startScore: 20, checkoutMode: 'master', legsToWin: 1 });
res = throwDarts(state, [S(20)]); // S20 on 20 — invalid in MO
eq(res.result.type, 'BUST', 'S20 on 20 MO: bust');
eq(res.result.reason, 'NOT_MASTER_CHECKOUT', 'Reason: not master');

suite('Throw Darts — Miss');
state = createGame({});
res = throwDarts(state, [MISS, MISS, MISS]);
eq(res.result.type, 'SCORE', '3x miss: valid score');
eq(res.state.scores[0], 501, 'Score unchanged');

suite('Throw Darts — Validation');
state = createGame({});
res = throwDarts(state, [T(25)]); // triple bull invalid
eq(res.result.error, 'INVALID_DART', 'T-Bull rejected');
res = throwDarts(state, []); // empty
eq(res.result.error, 'INVALID_DART_COUNT', 'Empty throw rejected');
res = throwDarts(state, [S(1),S(1),S(1),S(1)]); // 4 darts
eq(res.result.error, 'INVALID_DART_COUNT', '4 darts rejected');

// ═══════════════════════════════════════════
// THROWING — TOTAL SCORE
// ═══════════════════════════════════════════
suite('Throw Total — Basic');
state = createGame({ startScore: 501, checkoutMode: 'single', legsToWin: 1 });
res = throwTotal(state, 180);
eq(res.result.type, 'SCORE', 'Total 180 accepted');
eq(res.state.scores[0], 321, '501-180=321');

res = throwTotal(res.state, 100);
eq(res.state.scores[1], 401, '501-100=401 for P2');

suite('Throw Total — Impossible Score');
state = createGame({});
res = throwTotal(state, 163);
eq(res.result.error, 'IMPOSSIBLE_SCORE', '163 rejected');
res = throwTotal(state, 179);
eq(res.result.error, 'IMPOSSIBLE_SCORE', '179 rejected');

suite('Throw Total — Bust');
state = createGame({ startScore: 50, checkoutMode: 'double' });
res = throwTotal(state, 60);
eq(res.result.type, 'BUST', '60>50 bust');
res = throwTotal(state, 49);
eq(res.result.type, 'BUST', '49 leaves 1 in DO');

// ═══════════════════════════════════════════
// LEGS & SETS
// ═══════════════════════════════════════════
suite('Leg Progression');
state = createGame({ startScore: 40, checkoutMode: 'double', legsToWin: 2 });

// P1 wins leg 1
res = throwDarts(state, [D(20)]);
eq(res.result.type, 'LEG_WON', 'Leg 1 won');
eq(res.state.legs[0], 1, 'P1: 1 leg');
eq(res.state.currentLeg, 2, 'Now leg 2');
eq(res.state.scores[0], 40, 'Scores reset');
eq(res.state.legStarter, 1, 'P2 starts leg 2');

// P2 has to throw, P1 wins leg 2
res = throwDarts(res.state, [S(20), S(20), S(0)]); // P2 bust
res = throwDarts(res.state, [D(20)]); // P1 wins
eq(res.result.type, 'MATCH_WON', 'P1 wins match');
eq(res.state.winner, 0, 'P1 is winner');

suite('Set Progression');
state = createGame({ startScore: 40, checkoutMode: 'double', setsToWin: 2, legsPerSet: 2 });

// P1 wins leg 1 of set 1
res = throwDarts(state, [D(20)]);
eq(res.result.type, 'LEG_WON', 'Set 1, Leg 1 won');
eq(res.state.legs[0], 1, 'P1: 1 leg');

// P2 throws, P1 wins leg 2 of set 1 → set won
res = throwDarts(res.state, [S(20), D(10)]); // P2: 40-20-20=0 with D10
eq(res.result.type, 'LEG_WON', 'P2 wins leg 2 of set 1');
// Score: P1=1 leg, P2=1 leg. Next leg...
res = throwDarts(res.state, [D(20)]); // leg starter (P1 again after alternation)
eq(res.result.type, 'SET_WON', 'Set 1 won');
eq(res.state.sets[0], 1, 'P1: 1 set');
eq(res.state.legs[0], 0, 'Legs reset for new set');
eq(res.state.currentSet, 2, 'Now set 2');

suite('Alternating Starters');
state = createGame({ startScore: 40, checkoutMode: 'double', legsToWin: 3 });
eq(state.legStarter, 0, 'Leg 1: P1 starts');
res = throwDarts(state, [D(20)]); // P1 wins
eq(res.state.legStarter, 1, 'Leg 2: P2 starts');
eq(res.state.currentPlayer, 1, 'P2 throws first');

// ═══════════════════════════════════════════
// UNDO
// ═══════════════════════════════════════════
suite('Undo Turn');
state = createGame({});
res = throwTotal(state, 100);
eq(res.state.scores[0], 401, 'After throw: 401');
res = undoTurn(res.state);
eq(res.result.type, 'UNDO_TURN', 'Undo type');
eq(res.state.scores[0], 501, 'Score restored to 501');
eq(res.state.currentPlayer, 0, 'Player restored');

suite('Undo Bust Turn');
state = createGame({ startScore: 50, checkoutMode: 'double' });
res = throwTotal(state, 60); // bust
eq(res.state.scores[0], 50, 'Bust: score unchanged');
res = undoTurn(res.state);
eq(res.state.currentPlayer, 0, 'Back to P1');
eq(res.state.turns.length, 0, 'Turn removed');

suite('Undo Leg');
state = createGame({ startScore: 40, checkoutMode: 'double', legsToWin: 2 });
res = throwDarts(state, [D(20)]); // P1 wins leg 1
eq(res.state.legs[0], 1, 'P1 has 1 leg');
res = undoLeg(res.state);
eq(res.result.type, 'UNDO_LEG', 'Undo leg type');
eq(res.state.legs[0], 0, 'P1 back to 0 legs');
eq(res.state.phase, Phase.AWAITING_THROW, 'Back to playing');

suite('Undo Nothing');
state = createGame({});
res = undoTurn(state);
eq(res.result.error, 'NOTHING_TO_UNDO', 'Cannot undo empty');
res = undoLeg(state);
eq(res.result.error, 'NO_LEG_TO_UNDO', 'Cannot undo leg');

// ═══════════════════════════════════════════
// STATS
// ═══════════════════════════════════════════
suite('Statistics');
state = createGame({ startScore: 501, checkoutMode: 'single', legsToWin: 1 });
res = throwTotal(state, 180); // P1
res = throwTotal(res.state, 100); // P2
res = throwTotal(res.state, 140); // P1
res = throwTotal(res.state, 60);  // P2

const stats = getStats(res.state);
eq(stats[0].average, 160, 'P1 avg: (180+140)/2=160');
eq(stats[0].ton80, 1, 'P1: 1x 180');
eq(stats[0].ton40, 2, 'P1: 2x 140+');
eq(stats[0].ton, 2, 'P1: 2x 100+');
eq(stats[0].highest, 180, 'P1 highest: 180');
eq(stats[1].average, 80, 'P2 avg: (100+60)/2=80');
eq(stats[1].ton, 1, 'P2: 1x 100+');

suite('Stats After Undo');
res = undoTurn(res.state); // undo P2's 60
const stats2 = getStats(res.state);
eq(stats2[1].totalThrows, 1, 'P2: 1 throw after undo');
eq(stats2[1].average, 100, 'P2 avg: 100 after undo');

// ═══════════════════════════════════════════
// CHECKOUT SUGGESTIONS
// ═══════════════════════════════════════════
suite('Checkout Suggestions In-Game');
state = createGame({ startScore: 170, checkoutMode: 'double', legsToWin: 1 });
let co = getCheckoutSuggestion(state);
eq(co?.path, 'T20 T20 Bull', 'Checkout at 170');

res = throwTotal(state, 100);
co = getCheckoutSuggestion(res.state); // P2 at 170
eq(co?.path, 'T20 T20 Bull', 'P2 checkout at 170');

// ═══════════════════════════════════════════
// GAME MODES
// ═══════════════════════════════════════════
suite('301 Double Out');
state = createGame({ startScore: 301, checkoutMode: 'double', legsToWin: 1 });
eq(state.scores[0], 301, '301 start');
res = throwTotal(state, 180);
eq(res.state.scores[0], 121, '301-180=121');

suite('701 Single Out');
state = createGame({ startScore: 701, checkoutMode: 'single', legsToWin: 1 });
eq(state.scores[0], 701, '701 start');

suite('Multiple Players');
state = createGame({ playerCount: 3, startScore: 40, checkoutMode: 'single', legsToWin: 1 });
eq(state.scores.length, 3, '3 players');
res = throwTotal(state, 20); // P1
eq(res.state.currentPlayer, 1, 'P2 next');
res = throwTotal(res.state, 20); // P2
eq(res.state.currentPlayer, 2, 'P3 next');
res = throwTotal(res.state, 20); // P3
eq(res.state.currentPlayer, 0, 'P1 next (wrap)');

// ═══════════════════════════════════════════
// 9-DARTER SIMULATION
// ═══════════════════════════════════════════
suite('9-Darter (Perfect Game)');
state = createGame({ startScore: 501, checkoutMode: 'double', legsToWin: 1 });

// 180 (T20 T20 T20)
res = throwDarts(state, [T(20), T(20), T(20)]);
eq(res.state.scores[0], 321, 'After 180: 321');

// P2 throws
res = throwTotal(res.state, 100);

// 180 (T20 T20 T20)
res = throwDarts(res.state, [T(20), T(20), T(20)]);
eq(res.state.scores[0], 141, 'After 360: 141');

// P2 throws
res = throwTotal(res.state, 100);

// 141 checkout: T20 T19 D12
res = throwDarts(res.state, [T(20), T(19), D(12)]);
eq(res.result.type, 'MATCH_WON', '9-darter: match won');
eq(res.state.winner, 0, 'P1 wins with 9-darter');

// Verify stats
const nineDarterStats = getStats(res.state);
eq(nineDarterStats[0].average, (180+180+141)/3, 'Avg: 167');
eq(nineDarterStats[0].ton80, 2, '2x 180');
eq(nineDarterStats[0].legs, 1, '1 leg won');

// ═══════════════════════════════════════════
// EDGE CASES
// ═══════════════════════════════════════════
suite('Edge Cases');

// Throw on completed game
state = createGame({ startScore: 40, checkoutMode: 'double', legsToWin: 1 });
res = throwDarts(state, [D(20)]);
eq(res.state.phase, Phase.MATCH_COMPLETE, 'Match complete');
res = throwDarts(res.state, [S(20)]); // try to throw on completed game
eq(res.result.error, 'NOT_AWAITING_THROW', 'Rejected: game over');

// Bull checkout in DO
state = createGame({ startScore: 50, checkoutMode: 'double', legsToWin: 1 });
res = throwDarts(state, [BULL]); // D25 = 50, valid DO checkout
eq(res.result.type, 'MATCH_WON', 'Bull checkout in DO');

// S-Bull not a checkout in DO
state = createGame({ startScore: 25, checkoutMode: 'double', legsToWin: 1 });
res = throwDarts(state, [SBULL]); // S25 = 25, not a double
eq(res.result.type, 'BUST', 'S-Bull not DO checkout');

// Exactly 0 with wrong checkout mode
state = createGame({ startScore: 3, checkoutMode: 'double', legsToWin: 1 });
res = throwDarts(state, [T(1)]); // T1=3, but T is not double
eq(res.result.type, 'BUST', 'T1 on 3 in DO: bust');

state = createGame({ startScore: 3, checkoutMode: 'master', legsToWin: 1 });
res = throwDarts(state, [T(1)]); // T1=3, T is master-valid
eq(res.result.type, 'MATCH_WON', 'T1 on 3 in MO: checkout');

// ═══════════════════════════════════════════
// FULL MATCH SIMULATION
// ═══════════════════════════════════════════
suite('Full Match — Best of 5 Legs');
state = createGame({ startScore: 40, checkoutMode: 'double', legsToWin: 3 });

// Leg 1: P1 wins (D20)
res = throwDarts(state, [D(20)]);
eq(res.result.type, 'LEG_WON', 'Leg 1: P1 wins');

// Leg 2: P2 starts, P2 wins
res = throwDarts(res.state, [D(20)]); // P2
eq(res.result.type, 'LEG_WON', 'Leg 2: P2 wins');
eq(res.state.legs[0], 1, 'P1: 1');
eq(res.state.legs[1], 1, 'P2: 1');

// Leg 3: P1 starts, P1 wins
res = throwDarts(res.state, [D(20)]); // P1
eq(res.result.type, 'LEG_WON', 'Leg 3: P1 wins');

// Leg 4: P2 starts, P1 needs to wait
res = throwDarts(res.state, [D(10), D(10)]); // P2: 20+20=40, checkout
eq(res.result.type, 'LEG_WON', 'Leg 4: P2 wins');
eq(res.state.legs[0], 2, 'P1: 2');
eq(res.state.legs[1], 2, 'P2: 2');

// Leg 5: decider, P1 starts
res = throwDarts(res.state, [D(20)]); // P1
eq(res.result.type, 'MATCH_WON', 'Leg 5: P1 wins match');
eq(res.state.winner, 0, 'P1 is champion');

// ═══════════════════════════════════════════
// BULL-OFF
// ═══════════════════════════════════════════
suite('Bull-Off — Basic');
state = createGame({ bullOff: true, startScore: 40, checkoutMode: 'double', legsToWin: 1 });
eq(state.phase, Phase.BULL_OFF, 'Starts in bull-off phase');

// P1 throws S-Bull (distance 1)
res = bullOffThrow(state, 0, SBULL);
eq(res.result.type, 'BULL_OFF_THROW', 'P1 throw recorded');
eq(res.result.waiting, true, 'Waiting for P2');

// P2 throws S20 (further)
res = bullOffThrow(res.state, 1, S(20));
eq(res.result.type, 'BULL_OFF_WON', 'Bull-off resolved');
eq(res.result.winner, 0, 'P1 wins (closer to bull)');
eq(res.state.phase, Phase.AWAITING_THROW, 'Now playing');
eq(res.state.currentPlayer, 0, 'P1 starts');

suite('Bull-Off — Bull wins');
state = createGame({ bullOff: true });
res = bullOffThrow(state, 0, S(5)); // far
res = bullOffThrow(res.state, 1, BULL); // bull!
eq(res.result.winner, 1, 'P2 wins with Bull');

suite('Bull-Off — Tie');
state = createGame({ bullOff: true });
res = bullOffThrow(state, 0, SBULL); // S-Bull
res = bullOffThrow(res.state, 1, SBULL); // S-Bull — tie!
eq(res.result.type, 'BULL_OFF_TIE', 'Tie detected');
eq(res.state.phase, Phase.BULL_OFF, 'Still in bull-off');

// Re-throw
res = bullOffThrow(res.state, 0, BULL); // Bull!
res = bullOffThrow(res.state, 1, SBULL); // S-Bull
eq(res.result.type, 'BULL_OFF_WON', 'Resolved after re-throw');
eq(res.result.winner, 0, 'P1 wins with Bull');

suite('Bull-Off — Wrong phase');
state = createGame({ bullOff: false });
res = bullOffThrow(state, 0, BULL);
eq(res.result.error, 'NOT_BULL_OFF', 'Rejected outside bull-off');

suite('Bull-Off — Miss vs any hit');
state = createGame({ bullOff: true });
res = bullOffThrow(state, 0, MISS); // miss
res = bullOffThrow(res.state, 1, S(1)); // any hit
eq(res.result.winner, 1, 'Any hit beats miss');

// ═══════════════════════════════════════════
// SET STARTER
// ═══════════════════════════════════════════
suite('Manual Starter');
state = createGame({ bullOff: true });
res = setStarter(state, 1);
eq(res.result.type, 'STARTER_SET', 'Starter set');
eq(res.state.currentPlayer, 1, 'P2 starts');
eq(res.state.phase, Phase.AWAITING_THROW, 'Playing');

res = setStarter(state, 5);
eq(res.result.error, 'INVALID_PLAYER', 'Invalid player rejected');

// ═══════════════════════════════════════════
// TIMER
// ═══════════════════════════════════════════
suite('Timer — Basic');
state = createGame({ timeLimitSeconds: 300 }); // 5 min
assert(state.timer !== null, 'Timer exists');
eq(state.timer.limit, 300, 'Timer limit 300s');

const now = Date.now();
state = startTimer(state, now);
let timer = checkTimer(state, now + 60000); // 60s later
eq(timer.elapsed, 60, '60s elapsed');
eq(timer.remaining, 240, '240s remaining');
eq(timer.expired, false, 'Not expired');

timer = checkTimer(state, now + 300000); // 300s later
eq(timer.remaining, 0, '0s remaining');
eq(timer.expired, true, 'Expired');

timer = checkTimer(state, now + 400000); // 400s later
eq(timer.remaining, 0, 'Clamped to 0');
eq(timer.expired, true, 'Still expired');

suite('Timer — No timer configured');
state = createGame({});
eq(state.timer, null, 'No timer');
eq(checkTimer(state), null, 'checkTimer returns null');

suite('Timer — Reset on new leg');
state = createGame({ startScore: 40, checkoutMode: 'double', legsToWin: 2, timeLimitSeconds: 120 });
state = startTimer(state, 1000000);
res = throwDarts(state, [D(20)]); // win leg
assert(res.state.timer.legStartedAt !== null, 'Timer restarted on new leg');
neq(res.state.timer.legStartedAt, 1000000, 'New timestamp');

// ═══════════════════════════════════════════
// BULL DISTANCE
// ═══════════════════════════════════════════
suite('Bull Distance');
eq(bullDistance(25, 'D'), 0, 'Bull = 0 (best)');
eq(bullDistance(25, 'S'), 1, 'S-Bull = 1');
eq(bullDistance(0, 'S'), 999, 'Miss = 999 (worst)');
assert(bullDistance(1, 'T') < bullDistance(20, 'S'), 'T1 closer than S20');
assert(bullDistance(25, 'D') < bullDistance(25, 'S'), 'Bull closer than S-Bull');
assert(bullDistance(25, 'S') < bullDistance(1, 'S'), 'S-Bull closer than S1');

// ═══════════════════════════════════════════
// DECIDING LEG
// ═══════════════════════════════════════════
suite('Deciding Leg — Alternate (default)');
state = createGame({ startScore: 40, checkoutMode: 'double', setsToWin: 2, legsPerSet: 2, decidingLeg: 'alternate' });

// P1 wins leg 1 (starter: P1)
res = throwDarts(state, [D(20)]);
eq(res.result.type, 'LEG_WON', 'P1 wins L1');
// P2 wins leg 2
res = throwDarts(res.state, [D(20)]);
eq(res.result.type, 'LEG_WON', 'P2 wins L2');
eq(res.result.decidingLeg, true, 'Deciding leg flag');
// P1 wins deciding leg 3
res = throwDarts(res.state, [D(20)]);
eq(res.result.type, 'SET_WON', 'Set won after deciding leg');

suite('Deciding Leg — Bull-Off trigger');
state = createGame({ startScore: 40, checkoutMode: 'double', setsToWin: 2, legsPerSet: 2, decidingLeg: 'bull_off' });

// P1 wins leg 1
res = throwDarts(state, [D(20)]);
eq(res.state.legs[0], 1, 'P1 has 1 leg');

// P2 wins leg 2 → 1:1 → deciding leg needs bull-off
res = throwDarts(res.state, [D(20)]); // P2 starts leg 2 and wins
eq(res.result.type, 'LEG_WON', 'Leg 2 won');
eq(res.result.decidingLeg, true, 'Deciding leg flagged');
eq(res.result.needsBullOff, true, 'Bull-off needed');
eq(res.state.phase, Phase.BULL_OFF, 'Phase: bull-off');

// Do bull-off
res = bullOffThrow(res.state, 0, BULL);
res = bullOffThrow(res.state, 1, S(20));
eq(res.state.currentPlayer, 0, 'P1 starts deciding leg');

// P1 wins deciding leg → set won
res = throwDarts(res.state, [D(20)]);
eq(res.result.type, 'SET_WON', 'Set won after deciding leg');

suite('Deciding Leg — First Starter');
state = createGame({ startScore: 40, checkoutMode: 'double', setsToWin: 2, legsPerSet: 2, decidingLeg: 'first' });

res = throwDarts(state, [D(20)]); // P1 wins L1 (P1 started set)
res = throwDarts(res.state, [D(20)]); // P2 wins L2 → 1:1 → decider
eq(res.result.decidingLeg, true, 'Deciding leg');
eq(res.state.legStarter, 0, 'Set starter (P1) starts decider');

// ═══════════════════════════════════════════
// ENHANCED STATS
// ═══════════════════════════════════════════
suite('Enhanced Stats — Avg per Dart');
state = createGame({ startScore: 501, checkoutMode: 'single', legsToWin: 1 });
res = throwTotal(state, 180); // P1: 180 with 3 darts
res = throwTotal(res.state, 60); // P2
let s = getStats(res.state);
eq(s[0].avgPerDart, 60, 'P1 avg/dart: 180/3=60');
eq(s[1].avgPerDart, 20, 'P2 avg/dart: 60/3=20');

suite('Enhanced Stats — First 9 Average');
state = createGame({ startScore: 501, checkoutMode: 'single', legsToWin: 1 });
// P1: 100, P2: 50, P1: 140, P2: 50, P1: 80, P2: 50
res = throwTotal(state, 100);
res = throwTotal(res.state, 50);
res = throwTotal(res.state, 140);
res = throwTotal(res.state, 50);
res = throwTotal(res.state, 80);
res = throwTotal(res.state, 50);
s = getStats(res.state);
// P1 first 3 turns: 100, 140, 80 → avg = 106.67
eq(Math.round(s[0].first9avg * 100) / 100, 106.67, 'P1 first9avg: (100+140+80)/3');

suite('Enhanced Stats — Checkout %');
state = createGame({ startScore: 100, checkoutMode: 'double', legsToWin: 3 });
// P1 at 100 → checkout range → throws 60 (not a checkout)
res = throwTotal(state, 60); // P1: 100→40, in checkout range
// P2 throws
res = throwTotal(res.state, 60);
// P1 at 40 → checkout range → wins with D20
res = throwDarts(res.state, [D(20)]);
s = getStats(res.state);
eq(s[0].checkoutAttempts, 2, 'P1: 2 checkout attempts (both turns in range)');
eq(s[0].checkoutHits, 1, 'P1: 1 checkout hit');
eq(s[0].checkoutPct, 50, 'P1: 50% checkout rate');
eq(s[0].highestCheckout, 40, 'Highest checkout: 40');

suite('Enhanced Stats — Best Leg');
s = getStats(res.state);
eq(s[0].bestLegDarts, 6, 'Best leg: 2 turns × 3 darts = 6');

suite('Enhanced Stats — Scoring Distribution');
state = createGame({ startScore: 501, checkoutMode: 'single', legsToWin: 1 });
res = throwTotal(state, 180);   // P1: 161-180
res = throwTotal(res.state, 20);  // P2: 0-20
res = throwTotal(res.state, 140); // P1: 121-140
res = throwTotal(res.state, 60);  // P2: 41-60
s = getStats(res.state);
eq(s[0].distribution['161-180'], 1, 'P1: 1x 161-180');
eq(s[0].distribution['121-140'], 1, 'P1: 1x 121-140');
eq(s[1].distribution['0-20'], 1, 'P2: 1x 0-20');
eq(s[1].distribution['41-60'], 1, 'P2: 1x 41-60');
eq(s[1].distribution['81-100'], 0, 'P2: 0x 81-100');

// ═══════════════════════════════════════════
// STATS AFTER UNDO (regression)
// ═══════════════════════════════════════════
suite('Stats correctness after undo');
state = createGame({ startScore: 501, checkoutMode: 'single', legsToWin: 1 });
res = throwTotal(state, 180);
res = throwTotal(res.state, 100);
res = throwTotal(res.state, 140);
// Undo P1's 140
res = undoTurn(res.state);
s = getStats(res.state);
eq(s[0].totalThrows, 1, 'P1: 1 throw after undo');
eq(s[0].average, 180, 'P1 avg: 180 after undo');
eq(s[0].ton80, 1, 'P1: still 1x 180');
eq(s[0].distribution['161-180'], 1, 'Distribution correct after undo');

// ═══════════════════════════════════════════
// BULL-OFF + FULL GAME INTEGRATION
// ═══════════════════════════════════════════
suite('Full game with bull-off + timer + sets');
state = createGame({
  bullOff: true, startScore: 40, checkoutMode: 'double',
  setsToWin: 2, legsPerSet: 2, timeLimitSeconds: 120,
});
eq(state.phase, Phase.BULL_OFF, 'Start: bull-off');

// Bull-off
res = bullOffThrow(state, 0, S(20));
res = bullOffThrow(res.state, 1, BULL);
eq(res.result.winner, 1, 'P2 wins bull-off');
eq(res.state.currentPlayer, 1, 'P2 starts');
assert(res.state.timer.legStartedAt !== null, 'Timer started');

// P2 wins leg 1
res = throwDarts(res.state, [D(20)]);
eq(res.result.type, 'LEG_WON', 'P2 wins leg 1');

// P1 wins leg 2 → 1:1, deciding leg
res = throwDarts(res.state, [D(20)]); // P1 starts leg 2
eq(res.result.type, 'LEG_WON', 'P1 wins leg 2');
eq(res.result.decidingLeg, true, 'Deciding leg');

// P1 wins deciding leg 3 → set won
res = throwDarts(res.state, [D(20)]);
eq(res.result.type, 'SET_WON', 'P1 wins set 1');

// ═══════════════════════════════════════════
// CONFIG VALIDATION
// ═══════════════════════════════════════════
suite('Config Defaults');
const cfg = defaultConfig({});
eq(cfg.bullOff, false, 'Default: no bull-off');
eq(cfg.decidingLeg, 'alternate', 'Default: alternate deciding leg');
eq(cfg.timeLimitSeconds, null, 'Default: no timer');

const cfg2 = defaultConfig({ bullOff: true, timeLimitSeconds: 180 });
eq(cfg2.bullOff, true, 'Custom: bull-off on');
eq(cfg2.timeLimitSeconds, 180, 'Custom: 3min timer');

// ═══════════════════════════════════════════
// UNDO LEG — SET BOUNDARY REGRESSION
// ═══════════════════════════════════════════
suite('Undo Leg — set boundary regression');
// Reproduce the bug: undoLeg after a set boundary was crossed
// should correctly decrement the set count even when phase is AWAITING_THROW
state = createGame({ startScore: 40, checkoutMode: 'double', setsToWin: 2, legsPerSet: 2 });

// P1 wins leg 1
res = throwDarts(state, [D(20)]);
eq(res.result.type, 'LEG_WON', 'Set1 L1: P1 wins');

// P2 wins leg 2 → P1 wins set 1 (P2 was starter of leg2, but P1 had 1 leg already, now 1:1 → decider)
// Actually: P2 starts leg 2, P2 wins leg 2 → 1:1 → P1 wins decider below
res = throwDarts(res.state, [D(20)]); // P2 starts, P2 wins leg 2
eq(res.result.type, 'LEG_WON', 'Set1 L2: P2 wins');
eq(res.result.decidingLeg, true, 'Deciding leg');

// P1 wins deciding leg → Set won for P1
res = throwDarts(res.state, [D(20)]); // P1 starts decider, P1 wins
eq(res.result.type, 'SET_WON', 'Set 1 won by P1');
eq(res.state.sets[0], 1, 'P1 has 1 set');
eq(res.state.legs[0], 0, 'Legs reset after set');
eq(res.state.phase, Phase.AWAITING_THROW, 'Phase: AWAITING_THROW (not SET_COMPLETE)');

// Now undo the last leg — must also undo the set
const stateBeforeUndo = res.state;
res = undoLeg(stateBeforeUndo);
eq(res.result.type, 'UNDO_LEG', 'Undo succeeded');
eq(res.state.sets[0], 0, 'Set count correctly decremented to 0');
eq(res.state.setResults.length, 0, 'setResults cleared');
eq(res.state.legs[0], 1, 'P1 legs restored (1 before decider)');

// ═══════════════════════════════════════════
// THROW TOTAL — MASTER MODE BUST
// ═══════════════════════════════════════════
suite('throwTotal — Master mode remaining=1 bust');
state = createGame({ startScore: 41, checkoutMode: 'master', legsToWin: 1 });
// Throwing 40 would leave remaining=1, which is impossible in master out
res = throwTotal(state, 40);
eq(res.result.type, 'BUST', 'remaining=1 is bust in master mode');
eq(res.result.reason, 'NO_MASTER_FINISH', 'Reason: NO_MASTER_FINISH');
eq(res.state.scores[0], 41, 'Score unchanged after bust');

// ═══════════════════════════════════════════
// RESULT
// ═══════════════════════════════════════════
console.log(`\n${'═'.repeat(50)}`);
console.log(`🎯 RESULT: ${passed} passed, ${failed} failed (${passed + failed} total)`);
console.log(`${'═'.repeat(50)}\n`);
process.exit(failed > 0 ? 1 : 0);
