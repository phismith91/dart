# DartForge Engine — Claude Instructions

## Project Overview

Pure JavaScript state machine library for dart scoring and tournament management.
Zero dependencies. ~3800 lines. 687+ tests across three test suites.

## File Structure

```
dart/
├── src/
│   ├── types.js             ← Constants, dart math helpers, defaultConfig()
│   ├── checkouts.js         ← Checkout table (170 entries) + validation
│   ├── engine.js            ← Rules Engine: scoring, bust detection, sets/legs
│   ├── logger.js            ← Logging wrapper decorating engine
│   ├── tournament.js        ← Tournament Engine: phases, progression
│   └── formats/
│       ├── round-robin.js   ← Round Robin format
│       └── single-elim.js   ← Single Elimination bracket format
├── tests/
│   ├── engine.test.js       ← 413 tests for Rules Engine
│   ├── logger.test.js       ← 117 tests for Logger
│   └── tournament.test.js   ← 157 tests for Tournament Engine
└── package.json             ← ESM, Node >=18, zero deps

## Running Tests

```bash
npm test                 # all three suites
npm run test:engine      # Rules Engine only
npm run test:logger      # Logger only
npm run test:tournament  # Tournament Engine only
```

No `npm install` needed — the project has zero dependencies.

## Core Design Rules

1. **Pure functions:** Every exported function follows `(state, action) → { state, result }`
2. **No mutations:** Always spread into a new object: `{ ...state, field: newVal }`
3. **Errors as values:** Return `{ state, result: { error: 'CODE', message: '...' } }` — never throw
4. **JSON-serializable state:** No functions, classes, Sets, or Maps in state objects
5. **Zero dependencies:** Never add npm packages

## Adding a New Tournament Format

1. Create `formats/your-format.js`
2. Export exactly: `generate*()`, `reportResult()`, `undoResult()`, `isComplete()`, `getAllMatches()`, `getReadyMatches()`
3. Register in `tournament.js` (add to `startPhase` and result handlers)
4. Add tests in `tournament.test.js`

## Test Framework

Custom runner — no Jest/Vitest. Helpers defined at top of each test file:

```js
const suite = (n) => { ... };                           // group
const assert = (condition, label) => { ... };           // boolean check
const eq = (actual, expected, label) => { ... };        // equality
const neq = (actual, expected, label) => { ... };       // inequality

// Dart shorthand helpers
const S = (f) => ({ field: f, multiplier: 'S' });      // Single
const D = (f) => ({ field: f, multiplier: 'D' });      // Double
const T = (f) => ({ field: f, multiplier: 'T' });      // Triple
```

## Key Exports

### engine.js
```js
createGame(config)                      // → state
throwDarts(state, [dart, dart, dart])   // → { state, result }
throwTotal(state, total)                // → { state, result }
undoTurn(state)                         // → { state, result }
undoLeg(state)                          // → { state, result }
getStats(state)                         // → stats object
getCheckoutSuggestion(state)            // → dart[] | null
bullOffThrow(state, player, dart)       // → { state, result }
setStarter(state, playerIndex)          // → { state, result }
startTimer(state, now?)                 // → { state }
checkTimer(state, now?)                 // → { state, result }
```

### tournament.js
```js
createTournament(config)                // → tournamentState
startPhase(state)                       // → { state, result }
reportMatchResult(state, matchId, res)  // → { state, result }
advancePhase(state)                     // → { state, result }
getAllGroupTables(state)                 // → [{ groupName, table }]
```

## Roadmap Context

- Phase 1 & 2 complete (Rules + Tournament Engine, Logger)
- Phase 3 next: React UI, multi-device sync (WebSocket/Supabase)
- Phase 4: Double elim, Swiss, Player DB, Elo, Cricket/Shanghai game modes

## CI

GitHub Actions: Node 18, 20, 22 on push/PR to main. All 687+ tests must pass.
