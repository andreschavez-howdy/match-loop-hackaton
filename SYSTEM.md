# System

How MatchLoop's agentic pieces fit together. See `docs/SPEC.md` for the product spec
and `AI-DEV-LOG.md` for the narrative of how this was built and the concrete evidence
of the loop running.

## Agent map

| Agent | Role | When it runs |
|---|---|---|
| Interactive Claude Code session | Designs the reducer, UI, harness, and orchestrator; makes judgment calls the user is asked to confirm (styling, component structure) | During development, human-in-the-loop |
| Headless Claude Code (`claude -p`) | The **implementation agent**: reads a failing harness output plus `docs/SPEC.md`, patches `src/` to fix the root cause | Inside `scripts/autonomous-loop.mjs`, no human prompt |

The same underlying model plays both roles. What changes is the harness around it:
the interactive session has a human reviewing every step; the headless invocation
inside the loop runs unattended, scoped down to a single turn with a fixed set of
allowed tools (`Read Edit Write Glob Grep`, `Bash` explicitly denied) and a guardrail
that reverts anything it touches outside `src/`.

## Two-layer harness

1. **Unit (Vitest)** — calls `gameReducer.ts` directly with actions and asserts on the
   returned state. No DOM, no browser; the reducer is pure and timestamp-driven
   (actions carry timestamps and pre-built decks instead of the reducer calling
   `Date.now()` / `Math.random()`), so this layer is fully deterministic.
2. **End-to-end (Playwright)** — launches the real app in Chromium and drives it
   through actual clicks. Because the board shuffles randomly on load, tests first
   call a dev-only `window.__seedBoard(fixture)` hook (`src/testFixtures.ts`) to land
   on one of three known states (`fresh-board`, `pending-mismatch`, `one-pair-left`)
   before asserting anything — this is what makes UI-level testing of the 5 required
   edge cases deterministic instead of flaky.

Both layers together are "the harness" the orchestration script runs.

## The autonomous loop

`scripts/autonomous-loop.mjs` implements ACT → VERIFY → OBSERVE → FIX → VERIFY:

```
run harness
while harness is failing and iterations < 5:
    ACT/OBSERVE: send failing output + docs/SPEC.md context to the implementation agent
    FIX: agent patches src/ directly (acceptEdits permission mode, Bash denied)
    guardrail: snapshot the working tree before the agent ran; revert any file
               it changed outside src/ (tests and docs are the source of truth,
               not something to edit to make the harness pass)
    VERIFY: re-run harness
write every iteration (failure output, agent summary, cost, files changed,
anything reverted, pass/fail) to loop-log.json
```

The 5-iteration cap is a hard loop bound in the script, not something the agent
can extend — if the harness is still red after 5 patch attempts, the script exits
non-zero and the run is escalated to a human rather than looping forever.

`scripts/demo/inject-bug.mjs` deliberately reintroduces one real regression (removing
the guard for edge case #1) so the loop can be demonstrated end-to-end against an
actual failure instead of a simulated one. `AI-DEV-LOG.md` has the full transcript of
one such run, including a real bug found and fixed in the guardrail's own change
-detection logic along the way.
