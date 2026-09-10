# MatchLoop — Engineering Spec

## Objective
Build a small, playable Memory Match (Concentration) game where an autonomous QA agent
plays the game through the real UI, detects broken behavior against a set of known edge
cases, and hands off failures to an implementation agent that patches the code — looping
until the game is verifiably correct, with no human prompt inside the loop. The product
is intentionally simple; the differentiator is a visible ACT → VERIFY → OBSERVE → FIX →
VERIFY loop.

## Gameplay rules
- 4×4 board (8 pairs), all cards face-down at start.
- Click a face-down card to flip it.
- Second click on a different face-down card triggers a match check:
  - Match: both cards stay face-up, marked `matched`, move counter +1.
  - No match: after ~800ms, both flip back face-down, move counter +1.
- Timer starts on first click, stops the instant the last pair is matched.
- "New Game" button fully resets board, timer, moves, and matched state.

## Required edge-case behavior (the QA agent's test targets — non-negotiable)
1. A third card clicked while two cards are pending resolution must be ignored.
2. Clicking an already-matched card must be a no-op.
3. Rapid double-click on the same card must not count as a pair or increment moves.
4. The timer must stop on the exact move that completes the last pair — not early, not late.
5. "New Game" mid-round must leave no stale state from the previous round.

## Constraints
- Timebox: single hackathon session (hours, not days).
- Game logic must be deterministic and seedable for testing — no reliance on random
  shuffle inside tests.
- Max 5 autonomous loop iterations per bug before escalating to human review
  (deterministic guardrail, not agent judgment).
- No backend required — fully client-side.

## Architecture
- **Frontend:** React + TypeScript, Vite.
- **Game logic:** pure `gameReducer.ts` (useReducer pattern), no DOM dependency —
  unit-testable in isolation.
- **Test seeding hook:** dev-only `window.__seedBoard(fixture)` to load known board
  states ("one pair left", "pending unmatched pair", "fresh board") so Playwright
  fixtures are deterministic instead of depending on random shuffle.
- **Harness (two layers):**
  - Unit tests (Vitest) against `gameReducer.ts` for the 5 edge cases directly.
  - Playwright e2e tests that seed a fixture, interact with the real UI, assert on-screen
    state.
- **Orchestration script:** Node/bash runner that (1) runs the harness, (2) on failure
  feeds the failing output + relevant source file to the implementation agent, (3)
  applies the patch, (4) re-runs the harness, (5) repeats until green or the iteration
  cap is hit, logging every iteration.

## Definition of Done
- All 5 seeded edge-case fixtures pass in Playwright.
- Unit tests cover the reducer logic (target: ≥90% on `gameReducer.ts`).
- At least one full autonomous loop captured end-to-end: seeded broken state → agent fix
  → re-run → green, zero human prompts inside the loop.
- Game runnable locally (`npm run dev`) and deployed to a static host.
- Repo includes `SPEC.md`, `SYSTEM.md`, `AI-DEV-LOG.md`, `README.md`.
