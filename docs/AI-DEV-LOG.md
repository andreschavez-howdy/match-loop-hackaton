# AI Dev Log

A running record of the key decisions, iterations, and corrections made while building
MatchLoop with Claude Code. See `docs/SPEC.md` for the target behavior and
`SYSTEM.md` for the agent/orchestration architecture.

## 1. Scaffold

Vite + React + TypeScript project set up with Vitest (unit) and Playwright (e2e)
wired in from the start, before any game code existed, so the harness in
`docs/SPEC.md` had somewhere to land. Branch: `chore/scaffold`.

## 2. Game core

`src/gameReducer.ts` implemented as a pure, timestamp-driven reducer (no DOM
dependency): actions carry timestamps and pre-shuffled decks rather than the
reducer reading `Date.now()` or `Math.random()` itself, which is what makes it
possible to unit test deterministically. All 5 required edge cases from the
spec got a dedicated unit test; coverage on `gameReducer.ts` landed at 96%
statements / 100% lines.

**Human decision point:** once a minimal UI was working, we paused to decide
two things not covered by the spec: styling approach and component
structure. Rather than guess, the options were laid out with tradeoffs and
the user chose CSS Modules (zero new dependencies, scoped per component) and
a split into `Board` / `Card` / `StatsBar` components (vs. one large
`App.tsx`). That split also added `data-testid` hooks up front, which paid
off directly in the harness step below. Branch: `feat/game-core`.

## 3. Harness

Added a `SEED_BOARD` reducer action and `src/testFixtures.ts` with three
deterministic fixtures (`fresh-board`, `pending-mismatch`, `one-pair-left`),
exposed to the browser via a dev-only `window.__seedBoard(fixture)` hook
(dynamically imported so it's excluded from the production bundle — verified
with `npm run build`). This let `tests/e2e/edge-cases.spec.ts` drive the 5
edge cases against the real rendered UI without depending on the random
shuffle. Branch: `feat/harness`.

## 4. Autonomous loop

`scripts/autonomous-loop.mjs` runs the full harness (Vitest + Playwright).
On failure, it hands the failing output to Claude Code running headless
(`claude -p ... --output-format json`) as the implementation agent, which
patches `src/` directly. It re-runs the harness after every patch attempt,
capped at 5 iterations (a fixed loop bound, not left to agent judgment), and
writes every iteration to `loop-log.json`.

**A real bug in the guardrail itself, caught during the first live run:** the
orchestrator is supposed to only let the agent touch files under `src/`,
reverting anything else. The first version detected "changed files" with
`git diff --name-only`, which returns *every* uncommitted change versus
`HEAD` — not just what the agent changed in that turn. During the first real
run, this silently reverted an unrelated pending edit to `package.json` (two
npm scripts added moments earlier), because that edit was already sitting in
the working tree when the agent ran. The fix: snapshot the *content* of every
dirty path before invoking the agent, and diff against that snapshot
afterward, so only files the agent itself touched during its turn count as
"changed" — including further edits to a file that was already dirty (like
the demo bug below), which a simple before/after path-list comparison also
missed. Re-verified after the fix: a legitimate concurrent edit is left
alone, and the agent's actual file change is now correctly reported.

**Real, non-simulated evidence run:** `scripts/demo/inject-bug.mjs`
deliberately removes the guard for required edge case #1 ("a third card
clicked while two cards are pending resolution must be ignored") from
`src/gameReducer.ts`. Running `npm run demo:inject-bug && npm run loop`
produced this end-to-end, zero-human-prompt result:

- **Iteration 1** — harness run: 1 unit test fails
  (`edge case: ignores a third card clicked while a mismatched pair is
  pending`) and its matching Playwright e2e test fails the same way
  (`moves-counter` reads "Moves: 2" instead of "Moves: 1"). Full output
  captured in `loop-log.json`.
- The implementation agent (Claude Code, headless) read the failure and
  `docs/SPEC.md`, and reported: *"Fixed: `flipCard` now returns the unchanged
  state when two cards are already pending mismatch resolution, so a third
  click is a true no-op (same reference, no move/counter change) until
  `RESOLVE_MISMATCH` clears `pendingIds`."* Cost: **$0.1468**.
- Guardrail check: `filesChanged: ["src/gameReducer.ts"]`,
  `forbiddenChangesReverted: []` — the agent touched exactly the one file it
  should have, and nothing outside `src/`.
- Harness re-run: **all 12 unit tests and 6 e2e tests pass.**
- **Final status: `green` after 1 iteration** (out of a 5-iteration cap).

The applied fix (moving the `pendingIds.length === 2` guard earlier in
`flipCard`) is functionally identical to the original guard, just reordered —
a genuine independent fix, not a memorized revert of the injected diff.
Branch: `feat/autonomous-loop`.
