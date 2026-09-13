# MatchLoop

A self-playtesting Memory Match (Concentration) game. An autonomous QA agent plays the
game against seeded board states, catches broken behavior against known edge cases, and
hands failures to an implementation agent that patches the code — looping until every
edge case passes, with no human prompt inside the loop.

**Live demo:** https://match-loop-hackaton.vercel.app/

Built for Howdy's Dev Day 2026 Agentic Software Engineering Hackathon. See
[`docs/SPEC.md`](docs/SPEC.md) for the full product/engineering spec,
[`docs/SYSTEM.md`](docs/SYSTEM.md) for how the agents and harness fit together, and
[`docs/AI-DEV-LOG.md`](docs/AI-DEV-LOG.md) for the build narrative and real evidence of
the autonomous loop running.

## Quick start

Requires Node 20+.

```
npm install
npm run dev
```

Open the printed local URL (defaults to http://localhost:5173/) and play.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type-check and build for production (`dist/`) |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run Oxlint |
| `npm test` | Run the Vitest unit suite against `src/gameReducer.ts` |
| `npm run test:coverage` | Same, with a coverage report |
| `npm run test:e2e` | Run the Playwright e2e suite against the real UI (auto-starts the dev server) |
| `npm run loop` | Run the autonomous QA-fix loop (see below) |
| `npm run demo:inject-bug` | Deliberately reintroduce one real regression, to demo the loop against a genuine failure |

## Testing

Two layers, both described in [`docs/SYSTEM.md`](docs/SYSTEM.md):

- **Unit (Vitest)** — `src/gameReducer.ts` is a pure, timestamp-driven reducer with no
  DOM or randomness of its own, so it's tested directly with `npm test`.
- **End-to-end (Playwright)** — `npm run test:e2e` drives the real rendered UI. Since
  the board shuffles randomly on load, tests use a dev-only
  `window.__seedBoard(fixture)` hook (`src/testFixtures.ts`) to land on a known board
  state before asserting anything.

## Autonomous loop

```
npm run demo:inject-bug   # break a real edge case in src/gameReducer.ts
npm run loop              # harness fails -> agent fixes it -> harness passes
```

`npm run loop` runs the full harness; on failure it hands the output to Claude Code
running headless (`claude -p`) as the implementation agent, which patches `src/`
directly, then re-runs the harness — capped at 5 iterations. Every iteration is logged
to `loop-log.json`. This requires the [Claude Code CLI](https://claude.com/claude-code)
(`claude`) installed and authenticated on your machine.

## Environment variables

Copy `.env.example` to `.env` (never committed) if you want the orchestrator to use an
`ANTHROPIC_API_KEY` instead of your existing `claude` CLI login — see
`.env.example` for the one variable it reads.

## Project structure

```
src/
  gameReducer.ts       # pure game state machine
  testFixtures.ts       # deterministic board states for seeding (dev/test only)
  components/           # Board, Card, StatsBar
  App.tsx               # wires the reducer to the UI
tests/
  unit/                 # Vitest, against gameReducer.ts
  e2e/                   # Playwright, against the real UI
scripts/
  autonomous-loop.mjs    # the orchestrator
  demo/inject-bug.mjs    # deliberately breaks one edge case, for demoing the loop
docs/
  SPEC.md                # product & engineering spec
  SYSTEM.md              # agent map, harness, loop, context/parallelization evidence
  AI-DEV-LOG.md          # build narrative, iterations, and corrections
```
