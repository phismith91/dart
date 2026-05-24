// ═══════════════════════════════════════════
// DartForge Tournament Engine
// ═══════════════════════════════════════════
//
// Manages multi-phase tournaments.
// Chains group stages → KO stages → finals.
// Each phase can have different rules.
//
// ═══════════════════════════════════════════

import {
  generateBracket, propagateBracket, reportResult as elimReport,
  undoResult as elimUndo, isComplete as elimComplete,
  getAllMatches as elimMatches, getReadyMatches as elimReady,
  getPlacements,
} from './formats/single-elim.js';

import {
  generateGroups, reportGroupResult, undoGroupResult,
  calculateTable, getAdvancingParticipants, isGroupPhaseComplete,
  getAllGroupMatches, getReadyGroupMatches,
} from './formats/round-robin.js';

// ─── Tournament Factory ───

/**
 * Create a tournament
 * @param {object} config
 * @returns {object} TournamentState or { error } on invalid input
 */
export function createTournament(config) {
  const {
    name = 'Turnier',
    date = '',
    participants = [],
    phases = [],
    boards = null,
  } = config;

  if (participants.length < 2) return { error: 'NEED_TWO_PARTICIPANTS', message: 'Need at least 2 participants' };
  if (phases.length === 0) return { error: 'NEED_ONE_PHASE', message: 'Need at least 1 phase' };

  return {
    config: { name, date, participants: [...participants], boards },
    phases: phases.map((p, i) => ({
      config: { ...p },
      index: i,
      status: i === 0 ? 'setup' : 'pending',
      data: null,
    })),
    currentPhase: 0,
    status: 'setup',
    eventLog: [{
      ts: new Date().toISOString(),
      type: 'TOURNAMENT_CREATED',
      data: { name, participantCount: participants.length, phaseCount: phases.length },
    }],
  };
}

// ─── Phase Management ───

/**
 * Start the current phase (generate matches)
 * @param {object} state
 * @param {Array} [participants] - Override participants (for phases after the first)
 * @returns {{ state, result }}
 */
export function startPhase(state, participants = null) {
  const phaseIdx = state.currentPhase;
  const phase = state.phases[phaseIdx];
  if (!phase) return { state, result: { error: 'NO_PHASE' } };
  if (phase.status !== 'setup' && phase.status !== 'pending') {
    return { state, result: { error: 'PHASE_ALREADY_STARTED' } };
  }

  const ps = participants || state.config.participants;
  const fmt = phase.config.format;

  let data;
  if (fmt === 'single_elim') {
    const bracket = generateBracket(ps, { thirdPlace: phase.config.thirdPlace ?? false });
    if (bracket?.error) return { state, result: bracket };
    data = { format: 'single_elim', bracket, nameMap: buildNameMap(ps) };
  } else if (fmt === 'round_robin') {
    const groupResult = generateGroups(ps, phase.config.groups || 1, phase.config.seeding || 'snake');
    if (groupResult?.error) return { state, result: groupResult };
    data = { format: 'round_robin', ...groupResult, advanceCount: phase.config.advanceCount ?? 2 };
  } else {
    return { state, result: { error: 'UNKNOWN_FORMAT', format: fmt } };
  }

  const newPhases = [...state.phases];
  newPhases[phaseIdx] = { ...phase, status: 'running', data };

  const entry = { ts: new Date().toISOString(), type: 'PHASE_STARTED', data: { phase: phaseIdx, name: phase.config.name, format: fmt, participants: ps.length } };

  return {
    state: { ...state, phases: newPhases, status: 'running', eventLog: [...state.eventLog, entry] },
    result: { type: 'PHASE_STARTED', phase: phaseIdx },
  };
}

/**
 * Report a match result in the current phase
 */
export function reportMatchResult(state, matchId, result) {
  const phase = state.phases[state.currentPhase];
  if (!phase || phase.status !== 'running') {
    return { state, result: { error: 'PHASE_NOT_RUNNING' } };
  }

  const newPhases = deepCopyPhases(state.phases);
  const p = newPhases[state.currentPhase];
  let actionResult;

  if (p.data.format === 'single_elim') {
    actionResult = elimReport(p.data.bracket, matchId, result, p.data.nameMap);
    if (actionResult?.error) return { state, result: actionResult };
    p.data.bracket = actionResult.bracket;
  } else if (p.data.format === 'round_robin') {
    actionResult = reportGroupResult(p.data, matchId, result);
    if (actionResult?.error) return { state, result: actionResult };
    p.data = actionResult.groupState;
  }

  const entry = { ts: new Date().toISOString(), type: 'MATCH_RESULT', data: { phase: state.currentPhase, matchId, result } };

  return {
    state: { ...state, phases: newPhases, eventLog: [...state.eventLog, entry] },
    result: actionResult,
  };
}

/**
 * Undo a match result
 */
export function undoMatchResult(state, matchId) {
  const phase = state.phases[state.currentPhase];
  if (!phase || phase.status !== 'running') {
    return { state, result: { error: 'PHASE_NOT_RUNNING' } };
  }

  const newPhases = deepCopyPhases(state.phases);
  const p = newPhases[state.currentPhase];
  let actionResult;

  if (p.data.format === 'single_elim') {
    actionResult = elimUndo(p.data.bracket, matchId, p.data.nameMap);
    if (actionResult?.error) return { state, result: actionResult };
    p.data.bracket = actionResult.bracket;
  } else if (p.data.format === 'round_robin') {
    actionResult = undoGroupResult(p.data, matchId);
    if (actionResult?.error) return { state, result: actionResult };
    p.data = actionResult.groupState;
  }

  const entry = { ts: new Date().toISOString(), type: 'MATCH_UNDO', data: { phase: state.currentPhase, matchId } };

  return {
    state: { ...state, phases: newPhases, eventLog: [...state.eventLog, entry] },
    result: actionResult,
  };
}

/**
 * Advance to the next phase (chain group winners → KO bracket etc.)
 */
export function advancePhase(state) {
  const phase = state.phases[state.currentPhase];
  if (!phase) return { state, result: { error: 'NO_PHASE' } };

  if (phase.data.format === 'single_elim' && !elimComplete(phase.data.bracket)) {
    return { state, result: { error: 'PHASE_NOT_COMPLETE' } };
  }
  if (phase.data.format === 'round_robin' && !isGroupPhaseComplete(phase.data)) {
    return { state, result: { error: 'PHASE_NOT_COMPLETE' } };
  }

  const newPhases = deepCopyPhases(state.phases);
  newPhases[state.currentPhase].status = 'complete';

  const nextIdx = state.currentPhase + 1;
  if (nextIdx >= state.phases.length) {
    const entry = { ts: new Date().toISOString(), type: 'TOURNAMENT_COMPLETE', data: {} };
    return {
      state: { ...state, phases: newPhases, status: 'complete', eventLog: [...state.eventLog, entry] },
      result: { type: 'TOURNAMENT_COMPLETE' },
    };
  }

  let advancing;
  if (phase.data.format === 'round_robin') {
    advancing = getAdvancingParticipants(phase.data, phase.data.advanceCount);
  } else if (phase.data.format === 'single_elim') {
    const placements = getPlacements(phase.data.bracket);
    advancing = placements ? placements.map(p => ({
      id: p.id,
      name: state.config.participants.find(x => x.id === p.id)?.name || p.id,
      seed: p.place,
    })) : [];
  }

  newPhases[nextIdx].status = 'setup';

  const entry = { ts: new Date().toISOString(), type: 'PHASE_ADVANCED', data: { from: state.currentPhase, to: nextIdx, advancing: advancing.length } };

  const intermediateState = { ...state, phases: newPhases, currentPhase: nextIdx, eventLog: [...state.eventLog, entry] };
  return startPhase(intermediateState, advancing);
}

// ─── Query Functions ───

export function getCurrentPhase(state) {
  return state.phases[state.currentPhase] || null;
}

export function getAllMatches(state) {
  const phase = state.phases[state.currentPhase];
  if (!phase?.data) return [];
  if (phase.data.format === 'single_elim') return elimMatches(phase.data.bracket);
  if (phase.data.format === 'round_robin') return getAllGroupMatches(phase.data);
  return [];
}

export function getReadyMatches(state) {
  const phase = state.phases[state.currentPhase];
  if (!phase?.data) return [];
  if (phase.data.format === 'single_elim') return elimReady(phase.data.bracket);
  if (phase.data.format === 'round_robin') return getReadyGroupMatches(phase.data);
  return [];
}

export function getGroupTable(state, groupIdx = 0) {
  const phase = state.phases[state.currentPhase];
  if (!phase?.data || phase.data.format !== 'round_robin') return null;
  if (groupIdx >= phase.data.groups.length) return null;
  return calculateTable(phase.data.groups[groupIdx]);
}

export function getAllGroupTables(state) {
  const phase = state.phases[state.currentPhase];
  if (!phase?.data || phase.data.format !== 'round_robin') return null;
  return phase.data.groups.map((g, i) => ({
    group: i,
    groupName: `Gruppe ${String.fromCharCode(65 + i)}`,
    table: calculateTable(g),
  }));
}

export function isPhaseComplete(state) {
  const phase = state.phases[state.currentPhase];
  if (!phase?.data) return false;
  if (phase.data.format === 'single_elim') return elimComplete(phase.data.bracket);
  if (phase.data.format === 'round_robin') return isGroupPhaseComplete(phase.data);
  return false;
}

export function getStandings(state) {
  const lastComplete = [...state.phases].reverse().find(p => p.status === 'complete');
  if (!lastComplete?.data) return null;

  if (lastComplete.data.format === 'single_elim') {
    return getPlacements(lastComplete.data.bracket);
  }
  if (lastComplete.data.format === 'round_robin') {
    const tables = lastComplete.data.groups.map(g => calculateTable(g));
    return tables.flat().sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return b.points - a.points;
    });
  }
  return null;
}

export function getSchedule(state) {
  const ready = getReadyMatches(state);
  const boards = state.config.boards;

  if (!boards || boards.length === 0) {
    return ready.map(m => ({ ...m, board: null }));
  }

  return ready.map((m, i) => ({
    ...m,
    board: boards[i % boards.length],
  }));
}

// ─── Helpers ───

function buildNameMap(participants) {
  const m = {};
  for (const p of participants) { if (p.id) m[p.id] = p.name; }
  return m;
}

function deepCopyPhases(phases) {
  return JSON.parse(JSON.stringify(phases));
}

// ─── Re-exports for convenience ───
export { calculateTable, getAdvancingParticipants } from './formats/round-robin.js';
export { getPlacements, getAllMatches as getBracketMatches } from './formats/single-elim.js';
