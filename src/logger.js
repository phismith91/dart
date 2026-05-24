// ═══════════════════════════════════════════
// DartForge Rules Engine — Event Logger
// ═══════════════════════════════════════════
//
// Wraps engine actions to produce an immutable,
// append-only event log. The log is part of the
// state — serializable, exportable, auditable.
//
// ═══════════════════════════════════════════

import {
  createGame as _createGame,
  throwDarts as _throwDarts,
  throwTotal as _throwTotal,
  undoTurn as _undoTurn,
  undoLeg as _undoLeg,
  bullOffThrow as _bullOffThrow,
  setStarter as _setStarter,
  startTimer,
  getStats,
  getCheckoutSuggestion,
  checkTimer,
} from './engine.js';

import { dartValue, dartLabel } from './types.js';

// ─── Log Entry Factory ───

// seq is derived from the existing log length — no shared mutable counter needed
function logEntry(type, player, data, state) {
  return {
    seq: (state.eventLog || []).length,
    ts: new Date().toISOString(),
    type,
    player,
    data,
    snapshot: {
      scores: [...state.scores],
      legs: [...state.legs],
      sets: state.sets ? [...state.sets] : null,
      leg: state.currentLeg,
      set: state.currentSet,
      phase: state.phase,
    },
  };
}

function appendLog(state, entry) {
  return { ...state, eventLog: [...(state.eventLog || []), entry] };
}

// ─── Wrapped Actions ───

export function createGame(config) {
  const state = _createGame(config);
  const stateWithLog = { ...state, eventLog: [] };
  const entry = logEntry('GAME_CREATED', null, { config: { ...state.config } }, stateWithLog);
  return appendLog(stateWithLog, entry);
}

export function throwDarts(state, darts) {
  const { state: newState, result } = _throwDarts(state, darts);
  if (result.error) return { state, result };

  const dartsInfo = darts.map(d => ({
    field: d.field, multiplier: d.multiplier,
    value: dartValue(d.field, d.multiplier),
    label: dartLabel(d.field, d.multiplier),
  }));
  const total = dartsInfo.reduce((s, d) => s + d.value, 0);

  let entry;
  if (result.type === 'BUST') {
    entry = logEntry('BUST', result.turn.player, {
      darts: dartsInfo, total, reason: result.reason,
      remaining: state.scores[result.turn.player],
    }, newState);
  } else if (result.type === 'LEG_WON' || result.type === 'SET_WON' || result.type === 'MATCH_WON') {
    entry = logEntry(result.type, result.player, {
      darts: dartsInfo, total,
      checkout: total,
      remaining: 0,
      decidingLeg: result.decidingLeg || false,
      legResult: summarizeLeg(result.legResult),
      ...(result.setResult ? { setResult: result.setResult } : {}),
    }, newState);
  } else {
    entry = logEntry('SCORE', result.turn.player, {
      darts: dartsInfo, total,
      remaining: result.turn.remaining,
    }, newState);
  }

  return { state: appendLog(newState, entry), result };
}

export function throwTotal(state, total) {
  const { state: newState, result } = _throwTotal(state, total);
  if (result.error) return { state, result };

  let entry;
  if (result.type === 'BUST') {
    entry = logEntry('BUST', result.turn.player, {
      total, reason: result.reason,
      remaining: state.scores[result.turn.player],
    }, newState);
  } else if (result.type === 'LEG_WON' || result.type === 'SET_WON' || result.type === 'MATCH_WON') {
    entry = logEntry(result.type, result.player, {
      total, checkout: total, remaining: 0,
      decidingLeg: result.decidingLeg || false,
      legResult: summarizeLeg(result.legResult),
      ...(result.setResult ? { setResult: result.setResult } : {}),
    }, newState);
  } else {
    entry = logEntry('SCORE', result.turn.player, {
      total, remaining: result.turn.remaining,
    }, newState);
  }

  return { state: appendLog(newState, entry), result };
}

export function bullOffThrow(state, player, dart) {
  const { state: newState, result } = _bullOffThrow(state, player, dart);
  if (result.error) return { state, result };

  const entry = logEntry(result.type, player, {
    dart: { field: dart.field, multiplier: dart.multiplier, label: dartLabel(dart.field, dart.multiplier) },
    distance: result.distance ?? null,
    winner: result.winner ?? null,
    throws: result.throws?.map(t => ({
      player: t.player,
      label: dartLabel(t.dart.field, t.dart.multiplier),
      distance: t.distance,
    })) ?? null,
  }, newState);

  return { state: appendLog(newState, entry), result };
}

export function setStarter(state, player) {
  const { state: newState, result } = _setStarter(state, player);
  if (result.error) return { state, result };
  const entry = logEntry('STARTER_SET', player, {}, newState);
  return { state: appendLog(newState, entry), result };
}

export function undoTurn(state) {
  const { state: newState, result } = _undoTurn(state);
  if (result.error) return { state, result };
  const entry = logEntry('UNDO_TURN', result.restoredTurn.player, {
    undoneScore: result.restoredTurn.score,
    wasBust: result.restoredTurn.isBust,
  }, newState);
  return { state: appendLog(newState, entry), result };
}

export function undoLeg(state) {
  const { state: newState, result } = _undoLeg(state);
  if (result.error) return { state, result };
  const entry = logEntry('UNDO_LEG', result.restoredLeg.winner, {
    leg: result.restoredLeg.leg,
    set: result.restoredLeg.set,
  }, newState);
  return { state: appendLog(newState, entry), result };
}

// ─── Log Helpers ───

function summarizeLeg(legResult) {
  if (!legResult) return null;
  const turnsPerPlayer = {};
  for (const t of legResult.turns) {
    if (!turnsPerPlayer[t.player]) turnsPerPlayer[t.player] = { scores: [], busts: 0 };
    if (t.isBust) turnsPerPlayer[t.player].busts++;
    else turnsPerPlayer[t.player].scores.push(t.score);
  }
  const summary = {};
  for (const [p, data] of Object.entries(turnsPerPlayer)) {
    const avg = data.scores.length > 0 ? data.scores.reduce((a, b) => a + b, 0) / data.scores.length : 0;
    summary[p] = {
      turns: data.scores.length,
      darts: data.scores.length * 3,
      average: Math.round(avg * 100) / 100,
      busts: data.busts,
      highest: data.scores.length > 0 ? Math.max(...data.scores) : 0,
    };
  }
  return { winner: legResult.winner, leg: legResult.leg, set: legResult.set, players: summary };
}

// ─── Export Functions ───

/**
 * Get the raw event log
 * @param {object} state
 * @returns {Array} Event log entries
 */
export function getLog(state) {
  return state.eventLog || [];
}

/**
 * Export log as JSON string
 * @param {object} state
 * @returns {string} JSON
 */
export function exportJSON(state) {
  return JSON.stringify({
    config: state.config,
    events: state.eventLog || [],
    stats: getStats(state),
    winner: state.winner,
    finalScore: { legs: state.legs, sets: state.sets },
  }, null, 2);
}

/**
 * Generate a human-readable match report
 * @param {object} state
 * @param {string[]} [playerNames] - Names for players (optional)
 * @returns {string} Match report text
 */
export function generateMatchReport(state, playerNames = null) {
  const names = playerNames || Array.from({ length: state.config.playerCount }, (_, i) => `Spieler ${i + 1}`);
  const log = state.eventLog || [];
  const stats = getStats(state);
  const lines = [];

  lines.push('═══════════════════════════════════════');
  lines.push('         MATCH REPORT');
  lines.push('═══════════════════════════════════════');
  lines.push('');
  lines.push(`Modus: ${state.config.startScore} ${state.config.checkoutMode.toUpperCase()} OUT`);
  if (state.config.setsToWin) {
    lines.push(`Format: First to ${state.config.setsToWin} Sets (${state.config.legsPerSet} Legs/Set)`);
  } else {
    lines.push(`Format: First to ${state.config.legsToWin} Legs`);
  }
  lines.push(`Spieler: ${names.join(' vs ')}`);
  lines.push('');

  if (state.winner !== null) {
    lines.push(`🏆 SIEGER: ${names[state.winner]}`);
    if (state.sets) {
      lines.push(`   Sets: ${state.sets.join(' : ')}`);
    }
    lines.push(`   Legs: ${state.legs.join(' : ')}`);
    lines.push('');
  }

  lines.push('─── Statistiken ───');
  for (let p = 0; p < names.length; p++) {
    const s = stats[p];
    lines.push(`${names[p]}:`);
    lines.push(`  Ø ${s.average.toFixed(1)} (${s.avgPerDart.toFixed(1)}/Dart)`);
    lines.push(`  First 9: ${s.first9avg.toFixed(1)}`);
    lines.push(`  180s: ${s.ton80} | 140+: ${s.ton40} | 100+: ${s.ton}`);
    lines.push(`  Highest: ${s.highest}`);
    lines.push(`  Checkout: ${s.checkoutHits}/${s.checkoutAttempts} (${s.checkoutPct}%)`);
    if (s.highestCheckout > 0) lines.push(`  Highest CO: ${s.highestCheckout}`);
    if (s.bestLegDarts) lines.push(`  Best Leg: ${s.bestLegDarts} Darts`);
    lines.push('');
  }

  lines.push('─── Leg-Verlauf ───');
  let currentSet = 1;
  for (const event of log) {
    if (event.type === 'LEG_WON' || event.type === 'SET_WON' || event.type === 'MATCH_WON') {
      const d = event.data;
      const lr = d.legResult;
      if (!lr) continue;

      if (state.config.setsToWin && lr.set !== currentSet) {
        currentSet = lr.set;
        lines.push(`\n  ── Set ${currentSet} ──`);
      }

      const playerSummaries = Object.entries(lr.players || {}).map(([p, info]) => {
        return `${names[Number(p)]}: Ø${info.average} (${info.darts}d)`;
      }).join(' | ');

      const checkoutNote = d.checkout ? ` [CO: ${d.checkout}]` : '';
      const decidingNote = d.decidingLeg ? ' ★' : '';

      lines.push(`  Leg ${lr.leg}: ${names[lr.winner]} ✓  ${playerSummaries}${checkoutNote}${decidingNote}`);
    }
  }

  const undos = log.filter(e => e.type === 'UNDO_TURN' || e.type === 'UNDO_LEG');
  if (undos.length > 0) {
    lines.push('');
    lines.push(`─── Korrekturen: ${undos.length} ───`);
    for (const u of undos) {
      lines.push(`  ${u.ts.substring(11, 19)} ${u.type === 'UNDO_TURN' ? 'Wurf' : 'Leg'} zurück (${names[u.player]})`);
    }
  }

  const bullOffs = log.filter(e => e.type === 'BULL_OFF_WON');
  if (bullOffs.length > 0) {
    lines.push('');
    lines.push('─── Bull-Off ───');
    for (const bo of bullOffs) {
      const throws = (bo.data.throws || []).map(t => `${names[t.player]}: ${t.label}`).join(', ');
      lines.push(`  ${names[bo.data.winner]} beginnt (${throws})`);
    }
  }

  lines.push('');
  lines.push('═══════════════════════════════════════');
  lines.push(`Erstellt: ${new Date().toISOString()}`);
  lines.push(`Events: ${log.length} | DartForge Engine v0.2`);
  lines.push('═══════════════════════════════════════');

  return lines.join('\n');
}

// Re-export engine functions that don't need logging
export { getStats, getCheckoutSuggestion, checkTimer, startTimer };
