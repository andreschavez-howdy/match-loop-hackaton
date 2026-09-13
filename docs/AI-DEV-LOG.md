# AI Dev Log

A running record of the key decisions, iterations, and corrections made while building
MatchLoop with Claude Code. See `docs/SPEC.md` for the target behavior and
`docs/SYSTEM.md` for the agent/orchestration architecture.

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

## 5. Closing the orchestration gap: parallel review + polish agents

**Human decision point:** after the core loop, harness, README, and a Vercel
deployment were done, the user asked directly whether the submission actually
satisfied the official Dev Day rubric — and shared the real rules document
for the first time (up to that point, only the project's own kickoff brief
had been used as the spec). Auditing against it line by line surfaced two
concrete gaps: `SYSTEM.md` and `AI-DEV-LOG.md` needed to live under `/docs`
(they were at repo root), and — more substantively — the entire build so far
had been one continuous interactive session with no parallel or delegated
work, while the rubric explicitly requires "meaningful orchestration or
delegation beyond ordinary interactive AI assisted coding" and treats
Parallelization Evidence as its own required submission item.

**Response:** three independent agents were dispatched to run concurrently —
a visual-polish pass (the only writer, scoped to CSS Module files only), a
code review, and a security review (both read-only, run as the `Plan`
subagent type specifically because it has no `Edit`/`Write` tools). Full
detail, timing, and the reasoning behind the scope boundaries are in
`docs/SYSTEM.md`'s "Parallelization evidence" section. Two things worth
calling out here:

- **A worktree-isolation request failed and was handled inline.** The
  intent was to run the visual-polish agent in its own git worktree; the
  harness rejected it with a stale "not a git repository" error (this
  session's directory had started out non-git before `git init` ran, much
  earlier). Rather than block on it, the agent ran directly in the working
  tree instead — still safe, since it was the only one of the three with any
  write access at all.
- **Two independent agents converged on the same real bug from different
  angles.** The security review flagged that the guardrail's change
  detection (`git status --porcelain`) can't see gitignored paths, so a
  write to `.env` would be invisible to it — a genuine gap in a mechanism
  whose whole job is to catch out-of-scope writes. Working independently and
  without seeing that finding, the code review separately noticed that
  `revertPath()` used `git checkout`/`rm` based on *current* git status
  rather than restoring the *exact content already captured* in the
  pre-agent snapshot — meaning it could destroy unrelated pre-existing
  uncommitted work outside `src/`, not just undo the agent's own change. One
  fix (revert by writing back the snapshotted content directly via the
  filesystem, or deleting only if the path didn't exist before, checked
  against an explicit sensitive-path list that's always included regardless
  of git's view) resolved both independently-discovered findings at once.
  The code review also caught a real availability gap — no timeout on the
  `claude -p` or harness subprocess calls, so a hang would block the loop
  forever despite the "5 iterations or escalate" guarantee — which was
  fixed with an explicit `spawnSync` timeout treated as a failed run.

After integrating all three outputs, the full verification suite (`tsc -b`,
lint, unit tests with coverage, e2e tests, production build) was re-run
against the combined result, followed by a fresh `npm run demo:inject-bug &&
npm run loop` run to confirm the hardened guardrail still correctly detects,
fixes, and verifies a real regression end-to-end. All green.
