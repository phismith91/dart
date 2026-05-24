// ═══════════════════════════════════════════
// DartForge Rules Engine — Core State Machine
// ═══════════════════════════════════════════
//
// Pure functions: (state, action) => newState
// No side effects. No UI. No storage.
// Every transition is deterministic and testable.
//
// ═══════════════════════════════════════════

import {
  Phase, CheckoutMode, DecidingLeg, IMPOSSIBLE_TOTALS,
  dartValue, isValidDart, isDouble, isMaster, defaultConfig, bullDistance,
} from './types.js';
import { getCheckout, isValidCheckoutDart } from './checkouts.js';

// ─── State Factory ───

/**
 * Create initial game state from config
 * @param {object} config - Game configuration (use defaultConfig())
 * @returns {object} Initial game state
 */
export function createGame(config) {
  const cfg = defaultConfig(config);
  return {
    config: cfg,
    phase: cfg.bullOff ? Phase.BULL_OFF : Phase.AWAITING_THROW,
    currentLeg: 1,
    currentSet: 1,
    currentPlayer: 0,
    scores: Array(cfg.playerCount).fill(cfg.startScore),
    legs: Array(cfg.playerCount).fill(0),
    sets: cfg.setsToWin ? Array(cfg.playerCount).fill(0) : null,
    turns: [],
    legResults: [],
    setResults: [],
    legStarter: 0,
    setStarter: 0,
    winner: null,
    bullOffThrows: [],
    timer: cfg.timeLimitSeconds ? { limit: cfg.timeLimitSeconds, legStartedAt: null } : null,
  };
}

// ─── Bull-Off ───

/**
 * Record a bull-off throw to determine who starts
 * @param {object} state
 * @param {number} player - Which player is throwing
 * @param {{field:number, multiplier:string}} dart - The dart thrown
 * @param {number} [now] - Current timestamp (injectable for tests)
 * @returns {{ state: object, result: object }}
 */
export function bullOffThrow(state, player, dart, now = Date.now()) {
  if (state.phase !== Phase.BULL_OFF) {
    return { state, result: { error: 'NOT_BULL_OFF', message: 'Game is not in bull-off phase' } };
  }
  if (!isValidDart(dart.field, dart.multiplier)) {
    return { state, result: { error: 'INVALID_DART' } };
  }

  const dist = bullDistance(dart.field, dart.multiplier);
  const newThrows = [...state.bullOffThrows, { player, dart, distance: dist }];

  if (newThrows.length % state.config.playerCount !== 0) {
    // Still waiting for other players
    return {
      state: { ...state, bullOffThrows: newThrows },
      result: { type: 'BULL_OFF_THROW', player, dart, distance: dist, waiting: true },
    };
  }

  // All players threw — find closest
  const lastRound = newThrows.slice(-state.config.playerCount);
  const sorted = [...lastRound].sort((a, b) => a.distance - b.distance);

  // Check for tie (top players same distance)
  if (sorted.length >= 2 && sorted[0].distance === sorted[1].distance) {
    return {
      state: { ...state, bullOffThrows: newThrows },
      result: { type: 'BULL_OFF_TIE', throws: lastRound, message: 'Tie — throw again' },
    };
  }

  // Winner determined
  const winner = sorted[0].player;
  return {
    state: {
      ...state,
      phase: Phase.AWAITING_THROW,
      bullOffThrows: newThrows,
      currentPlayer: winner,
      legStarter: winner,
      setStarter: winner,
      timer: state.timer ? { ...state.timer, legStartedAt: now } : null,
    },
    result: { type: 'BULL_OFF_WON', winner, throws: lastRound },
  };
}

/**
 * Skip bull-off and manually set who starts
 * @param {object} state
 * @param {number} player - Who starts (0-indexed)
 * @param {number} [now] - Current timestamp (injectable for tests)
 * @returns {{ state: object, result: object }}
 */
export function setStarter(state, player, now = Date.now()) {
  if (player < 0 || player >= state.config.playerCount) {
    return { state, result: { error: 'INVALID_PLAYER' } };
  }
  return {
    state: {
      ...state,
      phase: Phase.AWAITING_THROW,
      currentPlayer: player,
      legStarter: player,
      setStarter: player,
      timer: state.timer ? { ...state.timer, legStartedAt: now } : null,
    },
    result: { type: 'STARTER_SET', player },
  };
}

// ─── Timer ───

/**
 * Start or restart the leg timer
 * @param {object} state
 * @param {number} [now] - Current timestamp (Date.now())
 * @returns {object} New state with timer started
 */
export function startTimer(state, now = Date.now()) {
  if (!state.timer) return state;
  return { ...state, timer: { ...state.timer, legStartedAt: now } };
}

/**
 * Check timer status
 * @param {object} state
 * @param {number} [now] - Current timestamp
 * @returns {{ elapsed: number, remaining: number, expired: boolean }|null}
 */
export function checkTimer(state, now = Date.now()) {
  if (!state.timer || !state.timer.legStartedAt) return null;
  const elapsed = Math.floor((now - state.timer.legStartedAt) / 1000);
  const remaining = Math.max(0, state.timer.limit - elapsed);
  return { elapsed, remaining, expired: remaining === 0 };
}

// ─── Actions ───

/**
 * Process a throw (array of darts)
 * @param {object} state - Current game state
 * @param {Array<{field:number, multiplier:string}>} darts - 1 to dartsPerTurn darts
 * @param {number} [now] - Current timestamp (injectable for tests)
 * @returns {{ state: object, result: object }} New state + result info
 */
export function throwDarts(state, darts, now = Date.now()) {
  if (state.phase !== Phase.AWAITING_THROW) {
    return { state, result: { error: 'NOT_AWAITING_THROW', message: `Game is in phase: ${state.phase}` } };
  }

  if (!Array.isArray(darts) || darts.length < 1 || darts.length > state.config.dartsPerTurn) {
    return { state, result: { error: 'INVALID_DART_COUNT', message: `Expected 1-${state.config.dartsPerTurn} darts` } };
  }

  // Validate each dart
  for (let i = 0; i < darts.length; i++) {
    const d = darts[i];
    if (!isValidDart(d.field, d.multiplier)) {
      return { state, result: { error: 'INVALID_DART', message: `Dart ${i + 1}: invalid field=${d.field} multi=${d.multiplier}` } };
    }
  }

  const player = state.currentPlayer;
  const remaining = state.scores[player];
  const totalScore = darts.reduce((sum, d) => sum + dartValue(d.field, d.multiplier), 0);

  const bustResult = checkBust(remaining, totalScore, darts, state.config.checkoutMode);

  if (bustResult.isBust) {
    const turn = { player, darts, score: 0, remaining, isBust: true, bustReason: bustResult.reason };
    return {
      state: {
        ...state,
        currentPlayer: nextPlayer(player, state.config.playerCount),
        turns: [...state.turns, turn],
      },
      result: { type: 'BUST', reason: bustResult.reason, turn },
    };
  }

  const newRemaining = remaining - totalScore;
  const newScores = [...state.scores];
  newScores[player] = newRemaining;

  const turn = { player, darts, score: totalScore, remaining: newRemaining, isBust: false };
  const newTurns = [...state.turns, turn];

  if (newRemaining === 0) {
    return handleLegWin(state, newScores, newTurns, turn, player, now);
  }

  return {
    state: {
      ...state,
      scores: newScores,
      currentPlayer: nextPlayer(player, state.config.playerCount),
      turns: newTurns,
    },
    result: { type: 'SCORE', turn },
  };
}

/**
 * Shortcut: enter a total score directly (for quick entry without individual darts)
 * Simplified bust check — cannot validate checkout dart multiplier.
 * @param {object} state
 * @param {number} total - Total score thrown
 * @param {number} [now] - Current timestamp (injectable for tests)
 * @returns {{ state: object, result: object }}
 */
export function throwTotal(state, total, now = Date.now()) {
  if (state.phase !== Phase.AWAITING_THROW) {
    return { state, result: { error: 'NOT_AWAITING_THROW' } };
  }

  if (typeof total !== 'number' || total < 0 || total > 180 || !Number.isInteger(total)) {
    return { state, result: { error: 'INVALID_SCORE', message: `Score must be 0-180 integer, got ${total}` } };
  }

  if (IMPOSSIBLE_TOTALS.has(total)) {
    return { state, result: { error: 'IMPOSSIBLE_SCORE', message: `${total} is not achievable with 3 darts` } };
  }

  const player = state.currentPlayer;
  const remaining = state.scores[player];
  const newRemaining = remaining - total;

  if (newRemaining < 0) {
    const turn = { player, darts: null, score: 0, remaining, isBust: true, bustReason: 'BELOW_ZERO' };
    return {
      state: { ...state, currentPlayer: nextPlayer(player, state.config.playerCount), turns: [...state.turns, turn] },
      result: { type: 'BUST', reason: 'BELOW_ZERO', turn },
    };
  }

  // remaining===1 is impossible in both double and master out
  if ((state.config.checkoutMode === CheckoutMode.DOUBLE || state.config.checkoutMode === CheckoutMode.MASTER) && newRemaining === 1) {
    const bustReason = state.config.checkoutMode === CheckoutMode.DOUBLE ? 'NO_DOUBLE_FINISH' : 'NO_MASTER_FINISH';
    const turn = { player, darts: null, score: 0, remaining, isBust: true, bustReason };
    return {
      state: { ...state, currentPlayer: nextPlayer(player, state.config.playerCount), turns: [...state.turns, turn] },
      result: { type: 'BUST', reason: bustReason, turn },
    };
  }

  const newScores = [...state.scores];
  newScores[player] = newRemaining;
  const turn = { player, darts: null, score: total, remaining: newRemaining, isBust: false };
  const newTurns = [...state.turns, turn];

  if (newRemaining === 0) {
    return handleLegWin(state, newScores, newTurns, turn, player, now);
  }

  return {
    state: { ...state, scores: newScores, currentPlayer: nextPlayer(player, state.config.playerCount), turns: newTurns },
    result: { type: 'SCORE', turn },
  };
}

/**
 * Undo the last turn
 * @param {object} state
 * @returns {{ state: object, result: object }}
 */
export function undoTurn(state) {
  if (state.phase !== Phase.AWAITING_THROW || state.turns.length === 0) {
    return { state, result: { error: 'NOTHING_TO_UNDO' } };
  }

  const lastTurn = state.turns[state.turns.length - 1];
  const newScores = [...state.scores];

  if (!lastTurn.isBust) {
    newScores[lastTurn.player] = lastTurn.remaining + lastTurn.score;
  }

  return {
    state: {
      ...state,
      scores: newScores,
      currentPlayer: lastTurn.player,
      turns: state.turns.slice(0, -1),
    },
    result: { type: 'UNDO_TURN', restoredTurn: lastTurn },
  };
}

/**
 * Undo the last completed leg
 * @param {object} state
 * @returns {{ state: object, result: object }}
 */
export function undoLeg(state) {
  if (state.legResults.length === 0) {
    return { state, result: { error: 'NO_LEG_TO_UNDO' } };
  }

  const lastLeg = state.legResults[state.legResults.length - 1];
  const newLegResults = state.legResults.slice(0, -1);

  // Restore scores from the leg's turns
  const restoredScores = Array(state.config.playerCount).fill(state.config.startScore);
  const restoredTurns = [];
  for (const turn of lastLeg.turns) {
    if (!turn.isBust) {
      restoredScores[turn.player] -= turn.score;
    }
    restoredTurns.push(turn);
  }

  let newLegs;
  let newSets = state.sets ? [...state.sets] : null;
  let newSetResults = [...state.setResults];
  let newCurrentSet = state.currentSet;
  let newCurrentLeg = lastLeg.leg;
  let newSetStarter = state.setStarter;

  if (newSets) {
    const lastSetResult = newSetResults[newSetResults.length - 1];
    if (lastSetResult && lastSetResult.set === lastLeg.set) {
      // The undone leg crossed a set boundary: legs were reset to 0 after the win.
      // Reconstruct legs by counting remaining results in that set.
      newSets[lastSetResult.winner]--;
      newSetResults = newSetResults.slice(0, -1);
      newLegs = Array(state.config.playerCount).fill(0);
      for (const r of newLegResults) {
        if (r.set === lastLeg.set) newLegs[r.winner]++;
      }
      newCurrentSet = lastLeg.set;
      newSetStarter = (state.setStarter - 1 + state.config.playerCount) % state.config.playerCount;
    } else {
      newLegs = [...state.legs];
      newLegs[lastLeg.winner]--;
    }
  } else {
    newLegs = [...state.legs];
    newLegs[lastLeg.winner]--;
  }

  return {
    state: {
      ...state,
      phase: Phase.AWAITING_THROW,
      scores: restoredScores,
      legs: newLegs,
      sets: newSets,
      setResults: newSetResults,
      turns: restoredTurns,
      legResults: newLegResults,
      currentLeg: newCurrentLeg,
      currentSet: newCurrentSet,
      setStarter: newSetStarter,
      currentPlayer: restoredTurns.length > 0 ? nextPlayer(restoredTurns[restoredTurns.length - 1].player, state.config.playerCount) : lastLeg.starter,
      legStarter: lastLeg.starter,
      winner: null,
    },
    result: { type: 'UNDO_LEG', restoredLeg: lastLeg },
  };
}

// ─── Query Functions ───

/**
 * Get comprehensive statistics for the current game
 * @param {object} state
 * @returns {Array<object>} Per-player stats
 */
export function getStats(state) {
  const allLegs = state.legResults;
  const dartsPerTurn = state.config.dartsPerTurn;

  return Array.from({ length: state.config.playerCount }, (_, p) => {
    const allTurns = [
      ...allLegs.flatMap(l => l.turns),
      ...state.turns,
    ].filter(t => t.player === p);

    const validTurns = allTurns.filter(t => !t.isBust);
    const scores = validTurns.map(t => t.score);
    const total = scores.reduce((a, b) => a + b, 0);
    const count = scores.length;

    const avgPerTurn = count > 0 ? total / count : 0;
    const totalDarts = count * dartsPerTurn;
    const avgPerDart = totalDarts > 0 ? total / totalDarts : 0;

    // First 9 darts average (first 3 turns per leg)
    const first9scores = [];
    for (const leg of allLegs) {
      const playerTurns = leg.turns.filter(t => t.player === p && !t.isBust);
      const first3 = playerTurns.slice(0, 3);
      if (first3.length > 0) {
        first9scores.push(first3.reduce((s, t) => s + t.score, 0) / first3.length);
      }
    }
    const currentPlayerTurns = state.turns.filter(t => t.player === p && !t.isBust);
    if (currentPlayerTurns.length >= 3) {
      const first3 = currentPlayerTurns.slice(0, 3);
      first9scores.push(first3.reduce((s, t) => s + t.score, 0) / first3.length);
    }
    const first9avg = first9scores.length > 0
      ? first9scores.reduce((a, b) => a + b, 0) / first9scores.length : 0;

    const checkoutZone = state.config.checkoutMode === 'single' ? 180
      : state.config.checkoutMode === 'double' ? 170 : 180;

    let checkoutAttempts = 0;
    let checkoutHits = 0;
    let highestCheckout = 0;

    for (const leg of allLegs) {
      const pTurns = leg.turns.filter(t => t.player === p);
      for (const t of pTurns) {
        const remBefore = t.remaining + (t.isBust ? 0 : t.score);
        if (remBefore <= checkoutZone && remBefore > 0) {
          checkoutAttempts++;
          if (t.remaining === 0 && !t.isBust) {
            checkoutHits++;
            if (t.score > highestCheckout) highestCheckout = t.score;
          }
        }
      }
    }
    for (const t of state.turns.filter(t => t.player === p)) {
      const remBefore = t.remaining + (t.isBust ? 0 : t.score);
      if (remBefore <= checkoutZone && remBefore > 0) {
        checkoutAttempts++;
        if (t.remaining === 0 && !t.isBust) {
          checkoutHits++;
          if (t.score > highestCheckout) highestCheckout = t.score;
        }
      }
    }
    const checkoutPct = checkoutAttempts > 0 ? (checkoutHits / checkoutAttempts) * 100 : 0;

    let bestLegDarts = Infinity;
    for (const leg of allLegs) {
      if (leg.winner === p) {
        const darts = leg.turns.filter(t => t.player === p && !t.isBust).length * dartsPerTurn;
        if (darts < bestLegDarts) bestLegDarts = darts;
      }
    }
    if (bestLegDarts === Infinity) bestLegDarts = null;

    const distribution = { '0-20': 0, '21-40': 0, '41-60': 0, '61-80': 0, '81-100': 0, '101-120': 0, '121-140': 0, '141-160': 0, '161-180': 0 };
    for (const s of scores) {
      if (s <= 20) distribution['0-20']++;
      else if (s <= 40) distribution['21-40']++;
      else if (s <= 60) distribution['41-60']++;
      else if (s <= 80) distribution['61-80']++;
      else if (s <= 100) distribution['81-100']++;
      else if (s <= 120) distribution['101-120']++;
      else if (s <= 140) distribution['121-140']++;
      else if (s <= 160) distribution['141-160']++;
      else distribution['161-180']++;
    }

    return {
      player: p,
      average: avgPerTurn,
      avgPerDart,
      first9avg,
      totalThrows: count,
      totalDarts,
      ton80: scores.filter(s => s === 180).length,
      ton40: scores.filter(s => s >= 140).length,
      ton: scores.filter(s => s >= 100).length,
      highest: count > 0 ? Math.max(...scores) : 0,
      legs: state.legs[p],
      sets: state.sets ? state.sets[p] : null,
      checkoutAttempts,
      checkoutHits,
      checkoutPct: Math.round(checkoutPct * 10) / 10,
      highestCheckout,
      bestLegDarts,
      distribution,
    };
  });
}

/**
 * Get checkout suggestion for current player
 * @param {object} state
 * @returns {{ path: string, darts: number }|null}
 */
export function getCheckoutSuggestion(state) {
  if (state.phase !== Phase.AWAITING_THROW) return null;
  const remaining = state.scores[state.currentPlayer];
  return getCheckout(remaining, state.config.checkoutMode);
}

// ─── Internal Helpers ───

function nextPlayer(current, playerCount) {
  return (current + 1) % playerCount;
}

function checkBust(remaining, totalScore, darts, checkoutMode) {
  const newRemaining = remaining - totalScore;

  if (newRemaining < 0) {
    return { isBust: true, reason: 'BELOW_ZERO' };
  }

  if (newRemaining === 0) {
    const lastDart = darts[darts.length - 1];
    if (checkoutMode === CheckoutMode.DOUBLE && !isDouble(lastDart.field, lastDart.multiplier)) {
      return { isBust: true, reason: 'NOT_DOUBLE_CHECKOUT' };
    }
    if (checkoutMode === CheckoutMode.MASTER && !isMaster(lastDart.field, lastDart.multiplier)) {
      return { isBust: true, reason: 'NOT_MASTER_CHECKOUT' };
    }
  }

  if (checkoutMode === CheckoutMode.DOUBLE && newRemaining === 1) {
    return { isBust: true, reason: 'NO_DOUBLE_FINISH' };
  }

  if (checkoutMode === CheckoutMode.MASTER && newRemaining === 1) {
    return { isBust: true, reason: 'NO_MASTER_FINISH' };
  }

  return { isBust: false };
}

function handleLegWin(state, newScores, newTurns, turn, player, now = Date.now()) {
  const newLegs = [...state.legs];
  newLegs[player]++;

  const legResult = {
    winner: player,
    leg: state.currentLeg,
    set: state.currentSet,
    turns: newTurns,
    starter: state.legStarter,
  };

  const cfg = state.config;
  const timerReset = state.timer ? { ...state.timer, legStartedAt: now } : null;

  // ── Sets mode ──
  if (cfg.setsToWin && cfg.legsPerSet) {
    if (newLegs[player] >= cfg.legsPerSet) {
      const newSets = [...state.sets];
      newSets[player]++;

      const setResult = {
        winner: player,
        set: state.currentSet,
        legs: state.legResults.length + 1,
      };

      if (newSets[player] >= cfg.setsToWin) {
        return {
          state: {
            ...state, scores: newScores, legs: newLegs, sets: newSets,
            turns: [], legResults: [...state.legResults, legResult],
            setResults: [...state.setResults, setResult],
            phase: Phase.MATCH_COMPLETE, winner: player, timer: null,
          },
          result: { type: 'MATCH_WON', player, turn, legResult, setResult },
        };
      }

      const newSetStarter = nextPlayer(state.setStarter, cfg.playerCount);
      return {
        state: {
          ...state,
          scores: Array(cfg.playerCount).fill(cfg.startScore),
          legs: Array(cfg.playerCount).fill(0),
          sets: newSets,
          turns: [],
          legResults: [...state.legResults, legResult],
          setResults: [...state.setResults, setResult],
          currentLeg: 1,
          currentSet: state.currentSet + 1,
          currentPlayer: newSetStarter,
          legStarter: newSetStarter,
          setStarter: newSetStarter,
          phase: Phase.AWAITING_THROW,
          timer: timerReset,
        },
        result: { type: 'SET_WON', player, turn, legResult, setResult },
      };
    }

    // Leg won, set continues
    let newLegStarter;
    const isDecidingLeg = isDecider(newLegs, cfg.legsPerSet, cfg.playerCount);

    if (isDecidingLeg && cfg.decidingLeg === DecidingLeg.BULL_OFF) {
      return {
        state: {
          ...state,
          scores: Array(cfg.playerCount).fill(cfg.startScore),
          legs: newLegs,
          turns: [],
          legResults: [...state.legResults, legResult],
          currentLeg: state.currentLeg + 1,
          phase: Phase.BULL_OFF,
          bullOffThrows: [],
          timer: timerReset,
        },
        result: { type: 'LEG_WON', player, turn, legResult, decidingLeg: true, needsBullOff: true },
      };
    } else if (isDecidingLeg && cfg.decidingLeg === DecidingLeg.FIRST_STARTER) {
      newLegStarter = state.setStarter;
    } else {
      newLegStarter = nextPlayer(state.legStarter, cfg.playerCount);
    }

    return {
      state: {
        ...state,
        scores: Array(cfg.playerCount).fill(cfg.startScore),
        legs: newLegs,
        turns: [],
        legResults: [...state.legResults, legResult],
        currentLeg: state.currentLeg + 1,
        currentPlayer: newLegStarter,
        legStarter: newLegStarter,
        phase: Phase.AWAITING_THROW,
        timer: timerReset,
      },
      result: { type: 'LEG_WON', player, turn, legResult, decidingLeg: isDecidingLeg },
    };
  }

  // ── Legs-only mode ──
  if (newLegs[player] >= cfg.legsToWin) {
    return {
      state: {
        ...state, scores: newScores, legs: newLegs,
        turns: [], legResults: [...state.legResults, legResult],
        phase: Phase.MATCH_COMPLETE, winner: player, timer: null,
      },
      result: { type: 'MATCH_WON', player, turn, legResult },
    };
  }

  const newLegStarter = nextPlayer(state.legStarter, cfg.playerCount);
  return {
    state: {
      ...state,
      scores: Array(cfg.playerCount).fill(cfg.startScore),
      legs: newLegs,
      turns: [],
      legResults: [...state.legResults, legResult],
      currentLeg: state.currentLeg + 1,
      currentPlayer: newLegStarter,
      legStarter: newLegStarter,
      phase: Phase.AWAITING_THROW,
      timer: timerReset,
    },
    result: { type: 'LEG_WON', player, turn, legResult },
  };
}

function isDecider(legs, legsPerSet, playerCount) {
  const threshold = legsPerSet - 1;
  let atThreshold = 0;
  for (let i = 0; i < playerCount; i++) {
    if (legs[i] >= threshold) atThreshold++;
  }
  return atThreshold >= 2;
}

// ─── Exports ───
export { Phase, CheckoutMode, DecidingLeg };
