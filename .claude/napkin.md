# Napkin Runbook — DartForge Engine

## Curation Rules
- Re-prioritize on every read.
- Keep recurring, high-value notes only.
- Max 10 items per category.
- Each item includes date + "Do instead".

## Execution & Validation (Highest Priority)

1. **[2026-05-23] Dateistruktur ist flach, NICHT unter `src/`**
   README beschreibt `src/` Ordner, aber alle JS-Dateien liegen direkt im Root.
   Do instead: Änderungen immer in `/home/philipp/projects/dart/*.js` — kein `src/` Prefix.

2. **[2026-05-23] Kein `npm install` nötig — Zero Dependencies**
   Das Projekt hat bewusst null Dependencies.
   Do instead: Niemals externe Packages vorschlagen oder installieren.

3. **[2026-05-23] Tests laufen mit Custom Runner, nicht Jest/Vitest**
   `suite()`, `assert()`, `eq()`, `neq()` sind eigene Helpers in den Testfiles.
   Do instead: `npm test` (oder `npm run test:engine`) — kein Testframework importieren.

4. **[2026-05-23] ESM — kein CommonJS**
   `"type": "module"` in package.json. Alle Imports mit `import/export`.
   Do instead: Nur ESM-Syntax verwenden; niemals `require()`.

## Shell & Command Reliability

1. **[2026-05-23] Test-Ausgabe lesen — Failures zeigen `❌` Prefix**
   Do instead: Nach `npm test` auf `❌`-Zeilen und abschließende `passed/failed` Zahlen prüfen.

## Domain Behavior Guardrails

1. **[2026-05-23] Pure Functions — niemals State mutieren**
   Alle Engines folgen `(state, action) → { state, result }`.
   Do instead: Immer neues State-Object returnen via Spread `{ ...state, field: newVal }`.

2. **[2026-05-23] Fehler als Return-Value, nicht als Exception**
   Do instead: `return { state, result: { error: 'CODE', message: '...' } }` — kein `throw`.

3. **[2026-05-23] State muss JSON-serialisierbar bleiben**
   Do instead: Keine Funktionen, Klassen, Sets oder Maps im State — nur Plain Objects & Arrays.

4. **[2026-05-23] Neues Tournament-Format als eigenes `formats/xxx.js`**
   Contract: `generate*()`, `reportResult()`, `undoResult()`, `isComplete()`, `getAllMatches()`, `getReadyMatches()`.
   Do instead: Interface exakt so exportieren, dann in `tournament.js` registrieren.

## User Directives

1. **[2026-05-23] Projekt ist Open Source Core — keine Vendor-Lock-Abhängigkeiten einbauen**
   Do instead: Engine bleibt framework- und storage-agnostisch.
