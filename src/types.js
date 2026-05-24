// ═══════════════════════════════════════════
// DartForge Rules Engine — Types & Constants
// ═══════════════════════════════════════════

/** All possible single-dart values (precomputed) */
export const SINGLE_DART_VALUES = (() => {
  const v = new Set();
  v.add(0); // miss
  for (let i = 1; i <= 20; i++) { v.add(i); v.add(i * 2); v.add(i * 3); }
  v.add(25); v.add(50);
  return v;
})();

/** 3-dart totals that are impossible */
export const IMPOSSIBLE_TOTALS = new Set([163, 166, 169, 172, 173, 175, 176, 178, 179]);

/** Checkout modes */
export const CheckoutMode = { SINGLE: 'single', DOUBLE: 'double', MASTER: 'master' };

/** Game phases */
export const Phase = {
  BULL_OFF: 'bull_off',
  AWAITING_THROW: 'awaiting_throw',
  LEG_COMPLETE: 'leg_complete',
  SET_COMPLETE: 'set_complete',
  MATCH_COMPLETE: 'match_complete',
};

/** Deciding leg starter rules */
export const DecidingLeg = {
  ALTERNATE: 'alternate',     // whoever started the set (standard PDC)
  BULL_OFF: 'bull_off',       // re-do bull-off for decider
  FIRST_STARTER: 'first',     // whoever started the match
};

/** Bull-off distance (lower = closer to bull center) */
export function bullDistance(field, multiplier) {
  if (field === 25 && multiplier === 'D') return 0;   // Bull (inner) = best
  if (field === 25 && multiplier === 'S') return 1;   // S-Bull (outer bull)
  if (field === 0) return 999;                        // Miss
  // Other fields: higher number = further from bull (simplified ranking)
  return 10 + field + (multiplier === 'T' ? 0 : multiplier === 'S' ? 5 : 3);
}

// ─── Dart helpers ───

/** Calculate value of a single dart */
export function dartValue(field, multiplier) {
  if (field === 0) return 0;
  if (field === 25) return multiplier === 'D' ? 50 : 25; // no triple bull
  return field * (multiplier === 'T' ? 3 : multiplier === 'D' ? 2 : 1);
}

/** Validate a single dart */
export function isValidDart(field, multiplier) {
  if (field === 0) return true; // miss
  if (field === 25) return multiplier === 'S' || multiplier === 'D'; // no triple bull
  if (field < 1 || field > 20 || !Number.isInteger(field)) return false;
  return ['S', 'D', 'T'].includes(multiplier);
}

/** Check if a dart is a double */
export function isDouble(field, multiplier) {
  return multiplier === 'D';
}

/** Check if a dart is a double or triple (master) */
export function isMaster(field, multiplier) {
  return multiplier === 'D' || multiplier === 'T';
}

/** Human-readable label for a dart */
export function dartLabel(field, multiplier) {
  if (field === 0) return 'Miss';
  if (field === 25) return multiplier === 'D' ? 'Bull' : 'S-Bull';
  return `${multiplier}${field}`;
}

// ─── Config defaults ───

export function defaultConfig(overrides = {}) {
  return {
    startScore: 501,
    checkoutMode: CheckoutMode.DOUBLE,
    dartsPerTurn: 3,
    legsToWin: 3,
    setsToWin: null,          // null = no sets, legs only
    legsPerSet: null,         // null = no sets
    playerCount: 2,
    bullOff: false,           // start with bull-off to determine first thrower
    decidingLeg: DecidingLeg.ALTERNATE,  // who starts the deciding leg
    timeLimitSeconds: null,   // null = no time limit, number = seconds per leg
    ...overrides,
  };
}
