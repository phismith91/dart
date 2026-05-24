// ═══════════════════════════════════════════
// DartForge Rules Engine — Checkouts
// ═══════════════════════════════════════════

import { SINGLE_DART_VALUES, dartValue } from './types.js';

/** Standard double-out checkout paths (most common/optimal routes) */
const DO_TABLE = {
  170:"T20 T20 Bull",167:"T20 T19 Bull",164:"T20 T18 Bull",161:"T20 T17 Bull",
  160:"T20 T20 D20",158:"T20 T20 D19",157:"T20 T19 D20",156:"T20 T20 D18",
  155:"T20 T19 D19",154:"T20 T18 D20",153:"T20 T19 D18",152:"T20 T20 D16",
  151:"T20 T17 D20",150:"T20 T18 D18",149:"T20 T19 D16",148:"T20 T16 D20",
  147:"T20 T17 D18",146:"T20 T18 D16",145:"T20 T19 D14",144:"T20 T20 D12",
  143:"T20 T17 D16",142:"T20 T14 D20",141:"T20 T19 D12",140:"T20 T16 D16",
  139:"T20 T13 D20",138:"T20 T18 D12",137:"T20 T19 D10",136:"T20 T20 D8",
  135:"T20 T17 D12",134:"T20 T14 D16",133:"T20 T19 D8",132:"T20 T16 D12",
  131:"T20 T13 D16",130:"T20 T18 D8",129:"T19 T16 D12",128:"T18 T14 D16",
  127:"T20 T17 D8",126:"T19 T19 D6",125:"T20 T19 Bull",124:"T20 T16 D8",
  123:"T19 T16 D9",122:"T18 T20 D4",121:"T20 T11 D14",120:"T20 S20 D20",
  119:"T19 T12 D8",118:"T20 S18 D20",117:"T20 S17 D20",116:"T20 S16 D20",
  115:"T20 S15 D20",114:"T20 S14 D20",113:"T20 S13 D20",112:"T20 T12 D8",
  111:"T20 S11 D20",110:"T20 S10 D20",109:"T20 S9 D20",108:"T20 S8 D20",
  107:"T20 S7 D20",106:"T20 S6 D20",105:"T20 S5 D20",104:"T20 S4 D20",
  103:"T20 S3 D20",102:"T20 S2 D20",101:"T20 S1 D20",100:"T20 D20",
  99:"T19 S10 D16",98:"T20 D19",97:"T19 D20",96:"T20 D18",95:"T19 D19",
  94:"T18 D20",93:"T19 D18",92:"T20 D16",91:"T17 D20",90:"T18 D18",
  89:"T19 D16",88:"T16 D20",87:"T17 D18",86:"T18 D16",85:"T19 D14",
  84:"T20 D12",83:"T17 D16",82:"T14 D20",81:"T19 D12",80:"T20 D10",
  79:"T13 D20",78:"T18 D12",77:"T19 D10",76:"T20 D8",75:"T17 D12",
  74:"T14 D16",73:"T19 D8",72:"T16 D12",71:"T13 D16",70:"T18 D8",
  69:"T19 D6",68:"T20 D4",67:"T17 D8",66:"T10 D18",65:"T19 D4",
  64:"T16 D8",63:"T13 D12",62:"T10 D16",61:"T15 D8",60:"S20 D20",
  59:"S19 D20",58:"S18 D20",57:"S17 D20",56:"S16 D20",55:"S15 D20",
  54:"S14 D20",53:"S13 D20",52:"S12 D20",51:"S11 D20",50:"S10 D20",
  49:"S9 D20",48:"S8 D20",47:"S7 D20",46:"S6 D20",45:"S5 D20",
  44:"S4 D20",43:"S3 D20",42:"S2 D20",41:"S1 D20",40:"D20",
  38:"D19",36:"D18",34:"D17",32:"D16",30:"D15",28:"D14",26:"D13",
  24:"D12",22:"D11",20:"D10",18:"D9",16:"D8",14:"D7",12:"D6",
  10:"D5",8:"D4",6:"D3",4:"D2",2:"D1",
  39:"S7 D16",37:"S5 D16",35:"S3 D16",33:"S1 D16",31:"S15 D8",
  29:"S13 D8",27:"S11 D8",25:"S9 D8",23:"S7 D8",21:"S5 D8",
  19:"S3 D8",17:"S1 D8",15:"S7 D4",13:"S5 D4",11:"S3 D4",
  9:"S1 D4",7:"S3 D2",5:"S1 D2",3:"S1 D1",
};

/**
 * Get checkout suggestion for a remaining score
 * @param {number} remaining - Score remaining
 * @param {'single'|'double'|'master'} mode - Checkout mode
 * @param {number} dartsLeft - Darts remaining in this turn (1-3)
 * @returns {{ path: string, darts: number }|null}
 */
export function getCheckout(remaining, mode, dartsLeft = 3) {
  if (remaining <= 0) return null;

  if (mode === 'single') {
    if (remaining <= 60 && dartsLeft >= 1) return { path: `S${remaining}`, darts: 1 };
    if (remaining <= 120 && dartsLeft >= 2) return { path: `setup + finish`, darts: 2 };
    if (remaining <= 180 && dartsLeft >= 3) return { path: `setup + finish`, darts: 3 };
    return null;
  }

  if (mode === 'double') {
    // Max DO checkout with 3 darts: 170 (T20 T20 Bull)
    if (remaining > 170 || remaining <= 0) return null;
    if (remaining === 1) return null; // impossible in DO
    const path = DO_TABLE[remaining];
    if (path) return { path, darts: path.split(' ').length };
    return null;
  }

  if (mode === 'master') {
    // Master: last dart must be double or triple
    // For simplicity, use DO table (doubles) + supplement with triple finishes
    if (remaining > 180 || remaining <= 0) return null;
    const doPath = DO_TABLE[remaining];
    if (doPath) return { path: doPath, darts: doPath.split(' ').length };
    // Additional master-only checkouts (finishing on triple)
    if (remaining <= 60 && remaining % 3 === 0) {
      return { path: `T${remaining / 3}`, darts: 1 };
    }
    return null;
  }

  return null;
}

/**
 * Check if a remaining score is checkable (can be finished)
 * @param {number} remaining
 * @param {'single'|'double'|'master'} mode
 * @returns {boolean}
 */
export function isCheckable(remaining, mode) {
  if (remaining <= 0) return false;
  if (mode === 'single') return remaining <= 180;
  if (mode === 'double') return remaining <= 170 && remaining !== 1 && DO_TABLE[remaining] != null;
  if (mode === 'master') return remaining <= 180 && getCheckout(remaining, mode) !== null;
  return false;
}

/**
 * Validate that a checkout dart satisfies the mode requirement
 * @param {number} field
 * @param {'S'|'D'|'T'} multiplier
 * @param {'single'|'double'|'master'} mode
 * @returns {boolean}
 */
export function isValidCheckoutDart(field, multiplier, mode) {
  if (mode === 'single') return true; // any dart
  if (mode === 'double') return multiplier === 'D';
  if (mode === 'master') return multiplier === 'D' || multiplier === 'T';
  return false;
}
