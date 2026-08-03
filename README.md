# 🎯 DartForge Engine

**The universal dart engine. From pub to world championship.**

Pure, deterministic, framework-agnostic game engine for darts. Handles scoring, tournament management, and match documentation — with zero dependencies and zero side effects.

[![CI](https://github.com/YOUR_USERNAME/dartforge-engine/actions/workflows/ci.yml/badge.svg)](https://github.com/YOUR_USERNAME/dartforge-engine/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## Why DartForge?

Existing tools are either scoring apps (Pro-Darter, n01) **or** tournament tools (Challonge) — never both. And they're locked to a single use case.

DartForge is **three independent engines** that compose freely:

| Engine | Purpose | Knows about |
|---|---|---|
| **Rules Engine** | Dart scoring, checkout, bust detection | A single match |
| **Tournament Engine** | Brackets, groups, phases, progression | Who plays whom |
| **Logger** | Event log, match reports, export | Everything |

Each engine is a **pure state machine**: `(state, action) → newState`. No UI, no storage, no network. Build any frontend on top.

## Quick Start

```bash
npm install dartforge-engine
```

### Casual Game (501 Double Out)

```js
import { createGame, throwDarts, getStats } from 'dartforge-engine/logger';

// Create a game
let state = createGame({ startScore: 501, checkoutMode: 'double', legsToWin: 3 });

// Throw darts (dart-by-dart)
let { state: s, result } = throwDarts(state, [
  { field: 20, multiplier: 'T' },  // Triple 20 = 60
  { field: 20, multiplier: 'T' },  // Triple 20 = 60
  { field: 20, multiplier: 'T' },  // Triple 20 = 60
]);
// result.type === 'SCORE', s.scores[0] === 321

// Or throw a total directly
({ state: s, result } = throwTotal(s, 100));

// Get stats anytime
const stats = getStats(s);
// { average: 140, ton80: 1, checkoutPct: 0, ... }
```

### Club Tournament (Groups + KO)

```js
import { createTournament, startPhase, reportMatchResult, advancePhase, getAllGroupTables } from 'dartforge-engine/tournament';

const tournament = createTournament({
  name: 'Vereinsmeisterschaft 2026',
  participants: [
    { id: 'p1', name: 'Alice' },
    { id: 'p2', name: 'Bob' },
    // ... up to any number
  ],
  phases: [
    { name: 'Gruppenphase', format: 'round_robin', groups: 2, advanceCount: 2 },
    { name: 'KO-Phase', format: 'single_elim', thirdPlace: true },
  ],
});

// Start group phase → generates all matches
let { state } = startPhase(tournament);

// Report results
({ state } = reportMatchResult(state, 'g0r0m0', { winner: 'p1', score1: 2, score2: 1 }));

// View group tables (with tiebreak logic)
const tables = getAllGroupTables(state);
// [{ groupName: 'Gruppe A', table: [{ name: 'Alice', points: 3, legDiff: 1, ... }] }]

// When group phase complete → advance to KO
({ state } = advancePhase(state));
// Top 2 per group are seeded into elimination bracket
```

## Features

### Rules Engine

- **Game modes:** 301, 501, 701, or any custom start score
- **Checkout:** Single Out, Double Out, Master Out (double or triple)
- **Sets + Legs:** Full set system (PDC World Championship format)
- **Bull-Off:** Determine who throws first (closest to bull wins)
- **Timer:** Configurable time limits per leg
- **Deciding Leg:** Configurable who starts (alternate / bull-off / first starter)
- **Bust detection:** Below zero, rest=1 in DO, wrong checkout dart
- **Two input modes:** Dart-by-dart (with checkout validation) or total score
- **Undo:** Turn-level and leg-level, fully reversible

### Statistics (computed from state — always correct after undo)

- 3-dart average and per-dart average
- First 9 darts average (standard pro metric)
- Checkout percentage (attempts vs. hits)
- Highest checkout
- Best leg (fewest darts)
- Scoring distribution (0–20, 21–40, ..., 161–180)
- 180s, 140+, 100+ counts

### Tournament Engine

- **Single Elimination** with optional third-place match
- **Round Robin** with configurable group count
- **Multi-phase:** Chain any formats (Groups → KO → Final)
- **BYE handling:** Automatic for non-power-of-2 participant counts
- **Seeding:** Snake draft for balanced groups
- **Group tables** with 5-level tiebreak: Points → Leg diff → Head-to-head → Legs won → Alphabetical
- **Multi-board scheduling** (FIFO assignment)
- **Undo** with downstream protection

### Logger

- Immutable, append-only event log
- Every action timestamped with state snapshot
- JSON export (config + events + stats)
- Human-readable match reports (stats, leg history, checkouts, corrections)
- Errors are not logged (only actual game actions)

## Architecture

```
dartforge-engine/
├── src/
│   ├── types.js              # Constants, dart math, config defaults
│   ├── checkouts.js           # Checkout table (170 entries) + suggestions
│   ├── engine.js              # Rules Engine (pure state machine)
│   ├── logger.js              # Logging wrapper (decorates engine)
│   ├── tournament.js          # Tournament Engine (phases, progression)
│   └── formats/
│       ├── single-elim.js     # Single elimination brackets
│       └── round-robin.js     # Round robin groups + tables
├── tests/
│   ├── engine.test.js         # 413 tests
│   ├── logger.test.js         # 117 tests
│   └── tournament.test.js     # 157 tests
└── package.json
```

**687 tests. 0 dependencies. ~3800 lines.**

### Design Principles

1. **Pure functions only.** `(state, action) → { state, result }`. No mutations, no side effects.
2. **State is a plain object.** Serialize to JSON, store anywhere, send over the wire.
3. **Engines are independent.** Use the Rules Engine without the Tournament Engine. Use the Tournament Engine without dart-specific rules.
4. **Undo-safe stats.** Statistics are computed from state, never tracked separately.
5. **Format-agnostic tournaments.** The Tournament Engine doesn't know about darts — it manages matches with results. Plug in chess, table tennis, whatever.

## Configuration

### Rules Config

```js
{
  startScore: 501,                    // 301, 501, 701, or any number
  checkoutMode: 'double',            // 'single' | 'double' | 'master'
  dartsPerTurn: 3,                   // Standard: 3
  legsToWin: 3,                      // First to X legs
  setsToWin: null,                   // null = no sets | number = sets mode
  legsPerSet: null,                  // Legs needed to win a set
  playerCount: 2,                    // 2+ players
  bullOff: false,                    // Bull-off to determine starter
  decidingLeg: 'alternate',          // 'alternate' | 'bull_off' | 'first'
  timeLimitSeconds: null,            // null = no limit | number = seconds
}
```

### Tournament Config

```js
{
  name: 'My Tournament',
  date: '2026-09-19',
  participants: [{ id: 'p1', name: 'Alice' }, ...],
  boards: ['Board 1', 'Board 2'],     // null = single board
  phases: [
    {
      name: 'Group Stage',
      format: 'round_robin',          // 'single_elim' | 'round_robin'
      groups: 4,                       // Number of groups
      advanceCount: 2,                 // Top X per group advance
      seeding: 'snake',                // 'snake' | 'manual'
    },
    {
      name: 'Knockout',
      format: 'single_elim',
      thirdPlace: true,
    },
  ],
}
```

## Roadmap

- [x] **Phase 1:** Rules Engine (scoring, checkout, sets, bull-off, timer)
- [x] **Phase 2:** Tournament Engine (single elim, round robin, phases)
- [x] **Phase 2:** Event logging + match reports
- [ ] **Phase 3:** Presentation Engine (React UI, TV mode, streaming overlay)
- [ ] **Phase 3:** Multi-device sync (WebSocket / Supabase Realtime)
- [ ] **Phase 4:** Double elimination format
- [ ] **Phase 4:** Swiss system format
- [ ] **Phase 4:** Player database + Elo ratings
- [ ] **Phase 4:** API + Autodarts integration
- [ ] **Phase 4:** Cricket, Shanghai, and other game modes

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines. We welcome:

- **Bug reports** with reproducible test cases
- **New formats** (Double Elimination, Swiss) as `src/formats/*.js`
- **Game modes** (Cricket, Around the Clock) as Rules Engine extensions
- **Translations** for match reports
- **Integrations** (Autodarts, Lidarts, Pro-Darter bridges)

## License

MIT — see [LICENSE](LICENSE).

---

Built with 🎯 by dart players, for dart players.
