# System

How MatchLoop's agentic pieces fit together. See `docs/SPEC.md` for the product spec
and `docs/AI-DEV-LOG.md` for the narrative of how this was built and the concrete
evidence of the loop running.

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
actual failure instead of a simulated one. `docs/AI-DEV-LOG.md` has the full
transcript of one such run, including a real bug found and fixed in the guardrail's
own change-detection logic along the way.

## Context engineering

What each agent receives is deliberately scoped down, not just "give it everything":

- **A durable spec instead of repeated instructions.** `docs/SPEC.md` was written before
  substantial implementation began and is the single source of truth for the 5 required
  edge cases. Both the interactive session and the headless implementation agent are
  pointed at it rather than having the rules re-explained inline every time — the point
  of a spec is that nobody, human or agent, has to keep re-deriving what "done" means.
- **Fresh, single-turn context per loop iteration.** Each `claude -p` invocation inside
  `scripts/autonomous-loop.mjs` is a brand-new session with no conversation history from
  previous iterations or from the interactive development session. It receives only the
  current failing harness output (truncated to 6,000 characters) plus a pointer to read
  `docs/SPEC.md` — not the accumulated history of how the bug got there. This keeps each
  fix attempt cheap (observed cost: $0.15-$0.26 per iteration) and keeps the agent
  reasoning about the actual current failure instead of stale context.
- **Tool access as a context boundary, not just an instruction.** The headless agent is
  restricted to `Read Edit Write Glob Grep` with `Bash` explicitly denied — it structurally
  cannot run arbitrary commands, only read and edit files. The two read-only review
  agents used for the parallel work below run as the `Plan` subagent type specifically
  because that type has no `Edit`/`Write` tools at all, so "don't modify anything" is
  enforced by what the agent *can* do, not by what it's told.
- **Structured handoffs instead of full transcripts.** `loop-log.json` and
  `docs/AI-DEV-LOG.md` are the handoff format between the automated loop and a human
  reviewing it afterward — a compact, structured record of what failed, what was tried,
  and what happened, rather than requiring anyone to replay the full session.

## Human as orchestrator

Concrete points where the engineer made the call rather than an agent:

- Chose CSS Modules over Tailwind/SCSS/BEM and a multi-component split over one file,
  after being presented options with tradeoffs rather than having either decided silently.
- Caught that the autonomous loop's guardrail was reverting unrelated pending changes
  (a real bug in the automation itself, not the product) and asked for/reviewed the fix
  before trusting the loop's evidence.
- Reviewed and merged every feature branch as its own pull request rather than letting
  work land on `main` unreviewed.
- Chose Vercel as the deploy target and walked through the actual import/deploy flow.
- Read the official Dev Day rubric against the existing submission and identified the
  missing orchestration/parallelization evidence, which is what the section below
  responds to.

## Parallelization evidence

Once the gap above was identified, three independent, non-overlapping workstreams were
dispatched as separate agents and run **concurrently** (launched together, running in
the background while the orchestrating session continued other work in the foreground):

| Agent | Type | Scope | Duration | Tool calls |
|---|---|---|---|---|
| Visual polish | `general-purpose` | Writes CSS only: `src/**/*.module.css` | 5m21s | 25 |
| Code review | `Plan` (no Edit/Write tools) | Reads `src/`, `scripts/`; reports findings | 4m48s | 15 |
| Security review | `Plan` (no Edit/Write tools) | Reads `src/`, `scripts/`, `.gitignore`; runs `npm audit`/`npm run build` as diagnostics | 2m01s | 17 |

**How the boundaries were chosen, and why no coordination was needed between them:**
the visual-polish agent is the only one of the three with write access at all, and its
task was scoped to CSS Module files exclusively (never `gameReducer.ts`, `testFixtures.ts`,
or any `data-testid`) so it can't collide with game logic or with what the e2e suite
depends on. The other two run as the `Plan` subagent type specifically *because* that
type has no `Edit`/`Write` tools — they are structurally incapable of writing to any
file, so they cannot conflict with the writer or with each other, by construction rather
than by prompt discipline alone. (Aside: I originally intended to also isolate the
visual-polish agent in its own git worktree; that failed in this sandboxed environment
with a stale "not a git repository" error, so it ran directly in the working tree
instead — safe here specifically because it was the only writer among the three.)

**What each produced, and how the outputs were integrated:**

- The **security review** came back first (clean overall — no secrets, no XSS, `npm
  audit` clean, and it independently re-confirmed the dev-only `window.__seedBoard` hook
  is excluded from the production bundle) but surfaced one real, non-trivial finding: the
  guardrail's `git status --porcelain`-based change detection can't see gitignored paths
  at all, so a write to `.env` would be completely invisible to it. It also caught a
  latent parsing bug (a git rename line like `R  old -> new` would be mis-parsed as one
  bogus path). Both were fixed in `scripts/autonomous-loop.mjs` immediately, while the
  other two agents were still running.
- The **code review**, working independently and without seeing the security review's
  output, converged on the *same underlying guardrail weakness* from a different angle:
  it noticed `revertPath()` used `git checkout`/`rm` based on current status instead of
  restoring the content actually captured in the pre-agent snapshot, which could destroy
  unrelated uncommitted work outside `src/` instead of just undoing the agent's change.
  The fix already applied for the security finding (revert by writing back the exact
  snapshotted content, or deleting only if the path didn't exist before) resolved this
  independently-discovered issue too. It also flagged a real gap — no timeout on the
  `claude -p` or harness subprocess calls, which could hang the "autonomous" loop
  indefinitely — and a minor robustness nit (`Card.tsx`'s `ICONS` array had no link to
  `gameReducer.ts`'s `PAIR_COUNT`). Both were fixed after this agent returned.
- The **visual polish** agent delivered CSS-only card-flip, match-celebration, and
  win-banner animations (plus `prefers-reduced-motion` support), and had already run and
  passed `tsc`, `lint`, the unit suite, and the e2e suite itself before reporting back.

**Final integration step:** after all three completed, the full verification suite
(`tsc -b`, `lint`, `vitest run --coverage`, `playwright test`, `npm run build`) was run
once more against the combined result of all three workstreams together, followed by a
fresh end-to-end run of `npm run demo:inject-bug && npm run loop` to confirm the
hardened guardrail still correctly detects, fixes, and verifies a real regression. All
green, zero conflicts — a direct result of the file-scope and tool-scope boundaries
chosen up front, not something that had to be reconciled after the fact.
