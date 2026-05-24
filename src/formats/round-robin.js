// ═══════════════════════════════════════════
// DartForge Tournament — Round Robin / Groups
// ═══════════════════════════════════════════

/**
 * Generate round robin groups
 * @param {Array} participants - [{id, name, seed}]
 * @param {number} [numGroups] - How many groups
 * @param {string} [seeding] - 'random' | 'snake' | 'manual'
 * @param {Function} [rng] - Random number generator (injectable for tests)
 * @returns {object} { groups, numGroups } or { error } on invalid input
 */
export function generateGroups(participants, numGroups = 1, seeding = 'snake', rng = Math.random) {
  if (participants.length < 2) return { error: 'NEED_TWO_PARTICIPANTS', message: 'Need at least 2 participants' };
  if (numGroups < 1) return { error: 'NEED_ONE_GROUP', message: 'Need at least 1 group' };
  if (numGroups > participants.length / 2) return { error: 'TOO_MANY_GROUPS', message: 'Too many groups for participant count' };

  let ordered;
  if (seeding === 'random') {
    ordered = [...participants].sort(() => rng() - 0.5);
  } else {
    ordered = [...participants];
  }

  const groups = Array.from({ length: numGroups }, () => ({ participants: [], matches: [] }));

  if (seeding === 'snake') {
    let dir = 1;
    let gIdx = 0;
    for (const p of ordered) {
      groups[gIdx].participants.push(p);
      gIdx += dir;
      if (gIdx >= numGroups) { gIdx = numGroups - 1; dir = -1; }
      else if (gIdx < 0) { gIdx = 0; dir = 1; }
    }
  } else {
    ordered.forEach((p, i) => groups[i % numGroups].participants.push(p));
  }

  for (let g = 0; g < groups.length; g++) {
    const gp = groups[g].participants;
    let matchIdx = 0;

    const rounds = generateRoundRobinRounds(gp);
    for (let r = 0; r < rounds.length; r++) {
      for (const [p1, p2] of rounds[r]) {
        groups[g].matches.push({
          id: `g${g}r${r}m${matchIdx}`,
          group: g,
          round: r,
          p1: p1.id,
          p2: p2.id,
          p1Name: p1.name,
          p2Name: p2.name,
          result: null,
          status: 'ready',
        });
        matchIdx++;
      }
    }
  }

  return { groups, numGroups };
}

/**
 * Report a group match result — returns new groupState (pure, no mutation of input).
 * @returns {{ type, matchId, result, group, groupState }|{ error }}
 */
export function reportGroupResult(groupState, matchId, result) {
  for (let gi = 0; gi < groupState.groups.length; gi++) {
    const matchIdx = groupState.groups[gi].matches.findIndex(m => m.id === matchId);
    if (matchIdx !== -1) {
      const match = groupState.groups[gi].matches[matchIdx];
      if (match.result) return { error: 'MATCH_ALREADY_COMPLETE' };

      const newGroups = groupState.groups.map((g, i) =>
        i !== gi ? g : {
          ...g,
          matches: g.matches.map((m, j) =>
            j !== matchIdx ? m : { ...m, result, status: 'complete' }
          ),
        }
      );
      const newGroupState = { ...groupState, groups: newGroups };
      return { type: 'GROUP_RESULT_REPORTED', matchId, result, group: newGroups[gi], groupState: newGroupState };
    }
  }
  return { error: 'MATCH_NOT_FOUND' };
}

/**
 * Undo a group match result — returns new groupState (pure, no mutation of input).
 * @returns {{ type, matchId, groupState }|{ error }}
 */
export function undoGroupResult(groupState, matchId) {
  for (let gi = 0; gi < groupState.groups.length; gi++) {
    const matchIdx = groupState.groups[gi].matches.findIndex(m => m.id === matchId);
    if (matchIdx !== -1) {
      const match = groupState.groups[gi].matches[matchIdx];
      if (!match.result) return { error: 'NO_RESULT' };

      const newGroups = groupState.groups.map((g, i) =>
        i !== gi ? g : {
          ...g,
          matches: g.matches.map((m, j) =>
            j !== matchIdx ? m : { ...m, result: null, status: 'ready' }
          ),
        }
      );
      const newGroupState = { ...groupState, groups: newGroups };
      return { type: 'GROUP_RESULT_UNDONE', matchId, groupState: newGroupState };
    }
  }
  return { error: 'MATCH_NOT_FOUND' };
}

/**
 * Calculate group table with tiebreakers
 * @param {object} group - { participants, matches }
 * @returns {Array} Sorted table rows
 *
 * Tiebreak order:
 * 1. Points (3 win, 1 draw, 0 loss)
 * 2. Leg difference (legs won - legs lost)
 * 3. Direct comparison (head-to-head)
 * 4. Legs won (total)
 * 5. Alphabetical
 */
export function calculateTable(group) {
  const { participants, matches } = group;
  const rows = {};

  for (const p of participants) {
    rows[p.id] = {
      id: p.id,
      name: p.name,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      points: 0,
      legsWon: 0,
      legsLost: 0,
      legDiff: 0,
    };
  }

  for (const m of matches) {
    if (!m.result) continue;
    const { winner, score1, score2 } = m.result;

    if (!rows[m.p1] || !rows[m.p2]) continue;

    rows[m.p1].played++;
    rows[m.p2].played++;
    rows[m.p1].legsWon += score1;
    rows[m.p1].legsLost += score2;
    rows[m.p2].legsWon += score2;
    rows[m.p2].legsLost += score1;

    if (winner === m.p1) {
      rows[m.p1].won++;
      rows[m.p1].points += 3;
      rows[m.p2].lost++;
    } else if (winner === m.p2) {
      rows[m.p2].won++;
      rows[m.p2].points += 3;
      rows[m.p1].lost++;
    } else {
      rows[m.p1].drawn++;
      rows[m.p2].drawn++;
      rows[m.p1].points += 1;
      rows[m.p2].points += 1;
    }
  }

  for (const id of Object.keys(rows)) {
    rows[id].legDiff = rows[id].legsWon - rows[id].legsLost;
  }

  const h2h = buildH2H(matches);

  const sorted = Object.values(rows).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.legDiff !== a.legDiff) return b.legDiff - a.legDiff;
    const directResult = h2hCompare(a.id, b.id, h2h);
    if (directResult !== 0) return directResult;
    if (b.legsWon !== a.legsWon) return b.legsWon - a.legsWon;
    return a.name.localeCompare(b.name);
  });

  sorted.forEach((row, i) => { row.rank = i + 1; });
  return sorted;
}

/**
 * Get participants advancing from groups
 * @param {object} groupState - { groups }
 * @param {number} advanceCount - How many per group advance
 * @returns {Array} Participants sorted by group rank
 */
export function getAdvancingParticipants(groupState, advanceCount) {
  const advancing = [];

  for (let g = 0; g < groupState.groups.length; g++) {
    const table = calculateTable(groupState.groups[g]);
    const top = table.slice(0, advanceCount);
    advancing.push(...top.map(row => ({
      id: row.id,
      name: row.name,
      fromGroup: g,
      groupRank: row.rank,
      seed: g * advanceCount + row.rank,
    })));
  }

  advancing.sort((a, b) => {
    if (a.groupRank !== b.groupRank) return a.groupRank - b.groupRank;
    return a.fromGroup - b.fromGroup;
  });

  return advancing;
}

/**
 * Check if all group matches are complete
 */
export function isGroupPhaseComplete(groupState) {
  return groupState.groups.every(g => g.matches.every(m => m.result !== null));
}

/**
 * Get all group matches
 */
export function getAllGroupMatches(groupState) {
  return groupState.groups.flatMap(g => g.matches);
}

/**
 * Get ready matches across all groups
 */
export function getReadyGroupMatches(groupState) {
  return getAllGroupMatches(groupState).filter(m => m.status === 'ready');
}

// ─── Helpers ───

function generateRoundRobinRounds(participants) {
  const n = participants.length;
  const ps = [...participants];

  if (n % 2 !== 0) {
    ps.push({ id: '__bye__', name: 'BYE', isBye: true });
  }

  const numRounds = ps.length - 1;
  const half = ps.length / 2;
  const rounds = [];

  for (let r = 0; r < numRounds; r++) {
    const round = [];
    for (let i = 0; i < half; i++) {
      const p1 = ps[i];
      const p2 = ps[ps.length - 1 - i];
      if (!p1.isBye && !p2.isBye) {
        round.push([p1, p2]);
      }
    }
    rounds.push(round);

    const last = ps.pop();
    ps.splice(1, 0, last);
  }

  return rounds;
}

function buildH2H(matches) {
  const h2h = {};
  for (const m of matches) {
    if (!m.result) continue;
    const key = [m.p1, m.p2].sort().join(':');
    if (!h2h[key]) h2h[key] = { wins: {} };
    if (m.result.winner) {
      h2h[key].wins[m.result.winner] = (h2h[key].wins[m.result.winner] || 0) + 1;
    }
  }
  return h2h;
}

function h2hCompare(idA, idB, h2h) {
  const key = [idA, idB].sort().join(':');
  const record = h2h[key];
  if (!record) return 0;
  const winsA = record.wins[idA] || 0;
  const winsB = record.wins[idB] || 0;
  return winsB - winsA;
}
