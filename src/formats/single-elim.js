// ═══════════════════════════════════════════
// DartForge Tournament — Single Elimination
// ═══════════════════════════════════════════

/**
 * Generate single elimination bracket
 * @param {Array} participants - [{id, name, seed}]
 * @param {object} [opts] - { thirdPlace: bool }
 * @returns {object} bracket or { error } on invalid input
 */
export function generateBracket(participants, opts = {}) {
  const n = participants.length;
  if (n < 2) return { error: 'NEED_TWO_PARTICIPANTS', message: 'Need at least 2 participants' };

  const bracketSize = Math.pow(2, Math.ceil(Math.log2(n)));
  const numRounds = Math.log2(bracketSize);

  const seeded = [...participants];
  while (seeded.length < bracketSize) {
    seeded.push({ id: null, name: 'BYE', isBye: true });
  }

  const firstRound = [];
  for (let i = 0; i < bracketSize / 2; i++) {
    const p1Idx = i;
    const p2Idx = bracketSize - 1 - i;
    const p1 = seeded[p1Idx];
    const p2 = seeded[p2Idx];

    const match = {
      id: `r0m${i}`,
      round: 0,
      position: i,
      p1: p1.id,
      p2: p2.id,
      p1Name: p1.name,
      p2Name: p2.name,
      result: null,
      status: 'pending',
    };

    if (p2.isBye) {
      match.result = { winner: p1.id, score1: 0, score2: 0, walkover: true };
      match.status = 'complete';
    } else if (p1.isBye) {
      match.result = { winner: p2.id, score1: 0, score2: 0, walkover: true };
      match.status = 'complete';
    } else {
      match.status = 'ready';
    }

    firstRound.push(match);
  }

  const rounds = [firstRound];
  for (let r = 1; r < numRounds; r++) {
    const matchCount = bracketSize / Math.pow(2, r + 1);
    const round = [];
    for (let m = 0; m < matchCount; m++) {
      round.push({
        id: `r${r}m${m}`,
        round: r,
        position: m,
        p1: null, p2: null,
        p1Name: null, p2Name: null,
        result: null,
        status: 'pending',
      });
    }
    rounds.push(round);
  }

  let thirdPlaceMatch = null;
  if (opts.thirdPlace && numRounds >= 2) {
    thirdPlaceMatch = {
      id: 'third',
      round: numRounds - 1,
      position: 0,
      p1: null, p2: null,
      p1Name: null, p2Name: null,
      result: null,
      status: 'pending',
      isThirdPlace: true,
    };
  }

  const bracket = { rounds, thirdPlaceMatch, roundNames: getRoundNames(numRounds) };
  propagateBracket(bracket, lookupMap(participants));
  return bracket;
}

/**
 * Propagate winners through bracket — mutates bracket in place (internal use only).
 * External callers must use the bracket returned by reportResult / undoResult.
 */
export function propagateBracket(bracket, nameMap = {}) {
  const { rounds, thirdPlaceMatch } = bracket;

  for (let r = 1; r < rounds.length; r++) {
    const prev = rounds[r - 1];
    const curr = rounds[r];

    for (let m = 0; m < curr.length; m++) {
      const feeder1 = prev[m * 2];
      const feeder2 = prev[m * 2 + 1];

      curr[m].p1 = feeder1?.result?.winner ?? null;
      curr[m].p2 = feeder2?.result?.winner ?? null;
      curr[m].p1Name = curr[m].p1 ? (nameMap[curr[m].p1] || curr[m].p1) : null;
      curr[m].p2Name = curr[m].p2 ? (nameMap[curr[m].p2] || curr[m].p2) : null;

      if (curr[m].result) {
        curr[m].status = 'complete';
      } else if (curr[m].p1 && curr[m].p2) {
        curr[m].status = 'ready';
      } else {
        curr[m].status = 'pending';
      }
    }
  }

  if (thirdPlaceMatch && rounds.length >= 2) {
    const semis = rounds[rounds.length - 2];
    if (semis.length === 2) {
      thirdPlaceMatch.p1 = getLoser(semis[0]);
      thirdPlaceMatch.p2 = getLoser(semis[1]);
      thirdPlaceMatch.p1Name = thirdPlaceMatch.p1 ? (nameMap[thirdPlaceMatch.p1] || thirdPlaceMatch.p1) : null;
      thirdPlaceMatch.p2Name = thirdPlaceMatch.p2 ? (nameMap[thirdPlaceMatch.p2] || thirdPlaceMatch.p2) : null;

      if (!thirdPlaceMatch.result && thirdPlaceMatch.p1 && thirdPlaceMatch.p2) {
        thirdPlaceMatch.status = 'ready';
      }
    }
  }
}

/**
 * Report a match result — returns a new bracket (pure, no mutation of input).
 * @returns {{ type, matchId, result, bracket }|{ error }}
 */
export function reportResult(bracket, matchId, result, nameMap = {}) {
  const match = findMatch(bracket, matchId);
  if (!match) return { error: 'MATCH_NOT_FOUND' };
  if (match.status === 'complete') return { error: 'MATCH_ALREADY_COMPLETE' };
  if (match.status === 'pending') return { error: 'MATCH_NOT_READY' };

  const newBracket = deepCopyBracket(bracket);
  const newMatch = findMatch(newBracket, matchId);
  newMatch.result = result;
  newMatch.status = 'complete';
  propagateBracket(newBracket, nameMap);

  return { type: 'RESULT_REPORTED', matchId, result, bracket: newBracket };
}

/**
 * Undo a match result — returns a new bracket (pure, no mutation of input).
 * @returns {{ type, matchId, bracket }|{ error }}
 */
export function undoResult(bracket, matchId, nameMap = {}) {
  const match = findMatch(bracket, matchId);
  if (!match) return { error: 'MATCH_NOT_FOUND' };
  if (!match.result) return { error: 'NO_RESULT' };

  const downstream = getDownstreamMatches(bracket, matchId);
  for (const dm of downstream) {
    if (dm.result) return { error: 'DOWNSTREAM_HAS_RESULTS', match: dm.id };
  }

  const newBracket = deepCopyBracket(bracket);
  const newMatch = findMatch(newBracket, matchId);
  newMatch.result = null;
  newMatch.status = 'ready';
  propagateBracket(newBracket, nameMap);

  return { type: 'RESULT_UNDONE', matchId, bracket: newBracket };
}

/**
 * Check if bracket is complete
 */
export function isComplete(bracket) {
  const final = bracket.rounds[bracket.rounds.length - 1][0];
  const finalDone = final.result !== null;
  const thirdDone = !bracket.thirdPlaceMatch || bracket.thirdPlaceMatch.result !== null;
  return finalDone && thirdDone;
}

/**
 * Get placements from completed bracket
 */
export function getPlacements(bracket) {
  const final = bracket.rounds[bracket.rounds.length - 1][0];
  if (!final.result) return null;

  const placements = [
    { place: 1, id: final.result.winner },
    { place: 2, id: final.result.winner === final.p1 ? final.p2 : final.p1 },
  ];

  if (bracket.thirdPlaceMatch?.result) {
    placements.push(
      { place: 3, id: bracket.thirdPlaceMatch.result.winner },
      { place: 4, id: bracket.thirdPlaceMatch.result.winner === bracket.thirdPlaceMatch.p1 ? bracket.thirdPlaceMatch.p2 : bracket.thirdPlaceMatch.p1 },
    );
  }

  return placements;
}

/**
 * Get all matches (including third place)
 */
export function getAllMatches(bracket) {
  const matches = bracket.rounds.flat();
  if (bracket.thirdPlaceMatch) matches.push(bracket.thirdPlaceMatch);
  return matches;
}

/**
 * Get ready-to-play matches
 */
export function getReadyMatches(bracket) {
  return getAllMatches(bracket).filter(m => m.status === 'ready');
}

// ─── Helpers ───

function findMatch(bracket, matchId) {
  for (const round of bracket.rounds) {
    const m = round.find(x => x.id === matchId);
    if (m) return m;
  }
  if (bracket.thirdPlaceMatch?.id === matchId) return bracket.thirdPlaceMatch;
  return null;
}

function getLoser(match) {
  if (!match.result) return null;
  return match.result.winner === match.p1 ? match.p2 : match.p1;
}

function getDownstreamMatches(bracket, matchId) {
  const match = findMatch(bracket, matchId);
  if (!match || match.isThirdPlace) return [];

  const results = [];
  const nextRoundIdx = match.round + 1;
  if (nextRoundIdx >= bracket.rounds.length) return [];

  const nextMatchIdx = Math.floor(match.position / 2);
  const nextMatch = bracket.rounds[nextRoundIdx]?.[nextMatchIdx];
  if (nextMatch) {
    results.push(nextMatch);
    results.push(...getDownstreamMatches(bracket, nextMatch.id));
  }
  return results;
}

function lookupMap(participants) {
  const m = {};
  for (const p of participants) { if (p.id) m[p.id] = p.name; }
  return m;
}

function deepCopyBracket(bracket) {
  return JSON.parse(JSON.stringify(bracket));
}

function getRoundNames(numRounds) {
  const names = {
    1: ['Finale'],
    2: ['Halbfinale', 'Finale'],
    3: ['Viertelfinale', 'Halbfinale', 'Finale'],
    4: ['Achtelfinale', 'Viertelfinale', 'Halbfinale', 'Finale'],
    5: ['Runde 1', 'Achtelfinale', 'Viertelfinale', 'Halbfinale', 'Finale'],
  };
  return names[numRounds] || Array.from({ length: numRounds }, (_, i) => i === numRounds - 1 ? 'Finale' : `Runde ${i + 1}`);
}
