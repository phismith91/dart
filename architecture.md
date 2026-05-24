# DartForge Engine — Architecture

## Vision

Universal dart platform: from pub night to world championship. Three independent engines that compose freely. Every tournament format is configurable; the engine adapts, not the user.

---

## System Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Application Layer                      │
│     (React UI, CLI, WebSocket server, any frontend)       │
└───────────────┬─────────────────────────────────────────┘
                │  plain JSON state, passed around freely
┌───────────────┴─────────────────────────────────────────┐
│                     Logger Layer                          │
│  Wraps engine calls. Appends timestamped events.         │
│  Exports JSON + human-readable match reports.            │
└───────────────┬─────────────────────────────────────────┘
                │
        ┌───────┴────────┐
        ▼                ▼
┌──────────────┐  ┌───────────────────┐
│ Rules Engine │  │ Tournament Engine │
│  engine.js   │  │  tournament.js    │
│              │  │                   │
│ - Scoring    │  │ - Brackets        │
│ - Bust check │  │ - Groups          │
│ - Sets/Legs  │  │ - Phase chain     │
│ - Bull-off   │  │ - Seeding         │
│ - Timer      │  │ - Board schedule  │
│ - Undo       │  │ - Undo (+ protect)│
└──────┬───────┘  └────────┬──────────┘
       │                   │
       ▼                   ▼
┌─────────────┐   ┌──────────────────────┐
│ checkouts.js│   │ formats/             │
│ types.js    │   │  single-elim.js      │
│             │   │  round-robin.js      │
└─────────────┘   └──────────────────────┘
```

---

## Design Principles

| Principle | Implementation |
|-----------|----------------|
| Pure functions | `(state, action) → { state, result }` — no mutations, no side effects |
| Serializable state | Plain objects only — serialize to JSON, store anywhere, replay anytime |
| Independent engines | Rules Engine has no concept of tournaments; Tournament Engine has no dart rules |
| Undo-safe stats | Statistics derived from state, never tracked separately → correct after any undo |
| Format-agnostic tournaments | Tournament Engine manages "matches with results" — plug in chess, table tennis, anything |
| Zero dependencies | No npm packages — install is just `git clone && npm test` |

---

## Rules Engine (`engine.js`)

Handles a single match from first dart to last. Knows nothing about brackets or tournaments.

### State Shape

```js
{
  config: RulesConfig,          // immutable after createGame
  phase: 'awaiting_throw' | 'bull_off' | 'leg_complete' | 'set_complete' | 'match_complete',
  currentLeg: number,
  currentSet: number,
  currentPlayer: number,
  scores: number[],             // remaining score per player
  legs: number[],               // legs won per player
  sets: number[] | null,        // sets won per player (null if no sets)
  turns: Turn[],                // full history of all turns
  legResults: LegResult[],
  setResults: SetResult[],
  legStarter: number,           // who throws first in current leg
  setStarter: number,
  winner: number | null,
  bullOffThrows: BullThrow[],
  timer: TimerState | null,
}
```

### Key Flows

**Throw (dart-by-dart):**
`throwDarts()` → validates each dart → updates score → detects bust → checks checkout → advances leg/set/match

**Throw (total):**
`throwTotal()` → validates total not in IMPOSSIBLE_TOTALS → same bust/checkout logic

**Bust detection:**
- Score goes below 0
- Score hits exactly 1 (in Double Out)
- Checkout dart doesn't match required multiplier (Double Out / Master Out)

**Undo:**
- `undoTurn()`: removes last turn from history, restores score
- `undoLeg()`: removes last completed leg, restores leg count + starter

---

## Tournament Engine (`tournament.js`)

Manages multi-phase tournaments. Orchestrates format modules.

### State Shape

```js
{
  config: { name, date, participants, boards },
  phases: Phase[],              // each phase has { config, index, status, data }
  currentPhase: number,
  status: 'setup' | 'running' | 'complete',
  eventLog: Event[],
}
```

### Phase Lifecycle

```
setup → (startPhase) → active → (all matches done) → complete → (advancePhase) → next phase setup
```

Each phase holds its own format-specific `data`:
- Round Robin: `{ groups: Group[], matches: Match[] }`
- Single Elim: `{ rounds: Round[], bracket: Match[][] }`

### Tiebreak (Round Robin)

5-level cascade:
1. Points (3/1/0 for W/D/L)
2. Leg difference (legs won − legs lost)
3. Head-to-head result
4. Legs won total
5. Alphabetical (deterministic fallback)

### Multi-Board Scheduling

FIFO: when a board becomes free, the next ready match is assigned. Board assignment is computed on-demand in `getSchedule()` — not stored in state.

---

## Logger (`logger.js`)

Wraps Rules Engine calls. Appends an immutable event to `state.eventLog` for every action.

```js
// Every event:
{ ts: ISO8601, type: 'THROW' | 'LEG_WON' | ..., data: { ...action details } }
```

Exports:
- `exportJSON(state)` → full log with config + events + per-player stats
- `generateMatchReport(state, playerNames?)` → human-readable text: leg history, checkout paths, averages, corrections

---

## Format Contract

Every format module in `formats/` must export:

```js
generate*(config, participants)     // → format-specific data structure
reportResult(data, matchId, result) // → { data, result }
undoResult(data, matchId)           // → { data, result }
isComplete(data)                    // → boolean
getAllMatches(data)                  // → Match[]
getReadyMatches(data)               // → Match[] (no pending dependencies)
```

The Tournament Engine calls these — it never knows the internal data structure of a format.

---

## Configuration Levels

| Setting | Tournament | Phase | Round | Match |
|---------|:----------:|:-----:|:-----:|:-----:|
| Game mode (501/..) | | ● | | |
| Checkout (SO/DO/MO) | | ● | ● | |
| Legs to Win | | ● | ● | |
| Sets | | ● | | |
| Team size | ● | | | |
| Format (KO/RR) | | ● | | |
| Board assignment | | | | ● |
| Branding/Theme | ● | | | |
| Seeding | | ● | | |

---

## Roadmap

| Phase | Status | Content |
|-------|--------|---------|
| 1 — Rules Engine | ✅ Done | 501/301/701, DO/SO/MO, Sets+Legs, Bull-off, Timer, Undo |
| 2 — Tournament Engine | ✅ Done | Single Elim, Round Robin, Multi-phase, Logger |
| 3 — Presentation | 🔲 Next | React UI, TV mode, WebSocket/Supabase sync, PWA |
| 4 — Formats & Pro | 🔲 Future | Double Elim, Swiss, Cricket, Player DB, Elo, API |

---

## Testing Strategy

687+ tests, custom runner (no test framework):

| Suite | File | Count | Covers |
|-------|------|-------|--------|
| Rules Engine | `engine.test.js` | 413 | Scoring, bust, checkout, sets, bull-off, undo, timer |
| Logger | `logger.test.js` | 117 | Event log, JSON export, match report |
| Tournament | `tournament.test.js` | 157 | Phases, seeding, tiebreak, bracket, advancement |

CI: Node 18 / 20 / 22 on GitHub Actions.

---

## Future Architecture Notes

**Multi-device sync (Phase 3):**
- Option A: Supabase Realtime (fast start)
- Option B: Django + Django Channels (self-hosted, matches existing stack)
- Option C: CRDTs via Yjs/Automerge (offline-first, no server)
- Recommendation: A → migrate to B as it grows

**Offline-first (critical for FFW/club use):**
Service Worker + BroadcastChannel for local WLAN play without internet.

**Frontend (Phase 3):**
Vite + React + TypeScript + TailwindCSS. State is already a serializable JSON tree — drop directly into Zustand or Redux Toolkit.
