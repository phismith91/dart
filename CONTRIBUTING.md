# Contributing to DartForge

Thanks for your interest in making DartForge better! 🎯

## Getting Started

```bash
git clone https://github.com/YOUR_USERNAME/dartforge-engine.git
cd dartforge-engine
npm test
```

No `npm install` needed — zero dependencies.

## Development Workflow

1. **Fork & clone** the repo
2. **Create a branch:** `git checkout -b feature/my-feature`
3. **Write tests first** — every new function needs tests
4. **Implement** — pure functions only, no side effects
5. **Run all tests:** `npm test` (all 687+ must pass)
6. **Commit** with a descriptive message
7. **Open a PR** against `main`

## Code Style

- **Pure functions:** `(state, action) → { state, result }` — no mutations
- **State is a plain object** — must be JSON-serializable
- **No dependencies** — keep the engine dependency-free
- **JSDoc comments** on all exported functions
- **Error handling:** Return `{ error: 'CODE', message: '...' }` instead of throwing

## Adding a New Tournament Format

1. Create `src/formats/your-format.js`
2. Export: `generate*()`, `reportResult()`, `undoResult()`, `isComplete()`, `getAllMatches()`, `getReadyMatches()`
3. Register in `src/tournament.js` (add to `startPhase` and result handlers)
4. Write tests in `tests/tournament.test.js`

## Adding a New Game Mode

1. Extend `src/engine.js` or create a separate module
2. New modes should use the same state shape and action interface
3. Checkout tables go in `src/checkouts.js`

## Test Guidelines

- Use the built-in test runner (no test framework needed)
- Tests are plain JS with `assert()` and `eq()` helpers
- Group tests in `suite('Name')` blocks
- Every edge case gets a test
- Run: `npm test`

## Reporting Bugs

Please include:
1. What you expected
2. What happened
3. A minimal code example that reproduces it
4. Ideally: a failing test case

## Questions?

Open a Discussion on GitHub or reach out via Issues.
