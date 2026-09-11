#!/usr/bin/env node
// Autonomous ACT -> VERIFY -> OBSERVE -> FIX -> VERIFY loop for MatchLoop.
//
// Runs the test harness (Vitest + Playwright). On failure, hands the failing
// output to Claude Code (running headless as the implementation agent), lets
// it patch src/, and re-runs the harness. Repeats until green or a hard
// iteration cap is hit -- no human prompt inside the loop.

import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MAX_ITERATIONS = 5
const MAX_OUTPUT_CHARS = 6000
const LOG_PATH = join(ROOT, 'loop-log.json')

function truncate(text, max = MAX_OUTPUT_CHARS) {
  if (text.length <= max) return text
  return `${text.slice(0, max)}\n... (truncated, ${text.length - max} more chars)`
}

function runCommand(command, args) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 50,
  })
  return {
    pass: result.status === 0,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
  }
}

function runHarness() {
  const unit = runCommand('npx', ['vitest', 'run'])
  const e2e = runCommand('npx', ['playwright', 'test'])
  return {
    pass: unit.pass && e2e.pass,
    output: [
      '=== Vitest (unit) ===',
      unit.output.trim(),
      '',
      '=== Playwright (e2e) ===',
      e2e.output.trim(),
    ].join('\n'),
  }
}

function gitStatusPaths() {
  const result = spawnSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' })
  return result.stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => line.slice(3).trim())
}

// Content snapshot of every path with uncommitted changes (tracked or
// untracked), so we can tell exactly which files the agent touched during its
// turn -- including further edits to a file that was already dirty before it
// ran (e.g. the deliberately injected demo bug) -- rather than only noticing
// paths that went from clean to dirty.
function snapshotWorkingTree() {
  const snapshot = new Map()
  for (const path of gitStatusPaths()) {
    try {
      snapshot.set(path, readFileSync(join(ROOT, path), 'utf8'))
    } catch {
      snapshot.set(path, null)
    }
  }
  return snapshot
}

function revertPath(path) {
  const status = spawnSync('git', ['status', '--porcelain', '--', path], {
    cwd: ROOT,
    encoding: 'utf8',
  }).stdout
  if (status.startsWith('??')) {
    rmSync(join(ROOT, path), { force: true })
  } else {
    spawnSync('git', ['checkout', '--', path], { cwd: ROOT })
  }
}

// The reducer, seed fixtures, and spec define the required behavior. The
// implementation agent is only allowed to change application code under src/
// -- tests and the spec are the source of truth, not something to edit to
// make the harness pass.
const ALLOWED_PREFIXES = ['src/']

function enforceAllowedChanges(snapshotBeforeAgentRan) {
  const after = snapshotWorkingTree()
  const allPaths = new Set([...snapshotBeforeAgentRan.keys(), ...after.keys()])
  const changed = [...allPaths].filter((path) => snapshotBeforeAgentRan.get(path) !== after.get(path))
  const forbidden = changed.filter((path) => !ALLOWED_PREFIXES.some((p) => path.startsWith(p)))
  for (const path of forbidden) {
    console.log(`  guardrail: reverting out-of-scope change to ${path}`)
    revertPath(path)
  }
  return { changed, forbidden }
}

function buildPrompt(failureOutput) {
  return `You are the implementation agent in MatchLoop's autonomous QA-fix loop.

The test harness for this Memory Match game (Vitest unit tests + Playwright
end-to-end tests against the real UI) is currently FAILING. Here is the
output from the harness run:

<failing-harness-output>
${truncate(failureOutput)}
</failing-harness-output>

Read docs/SPEC.md for the required game behavior, especially the 5 required
edge cases. Find the root cause of the failure in the application source and
fix it with the smallest correct change.

Rules:
- Only modify files under src/. Do not modify anything under tests/, docs/,
  or any config file -- the tests define the required behavior and must not
  be changed to make them pass.
- Make your best single, complete, correct attempt at a fix. Do not run the
  test suite yourself; the orchestrator re-runs it after you finish.`
}

function runImplementationAgent(failureOutput) {
  const prompt = buildPrompt(failureOutput)
  const result = spawnSync(
    'claude',
    [
      '-p',
      prompt,
      '--output-format',
      'json',
      '--permission-mode',
      'acceptEdits',
      '--allowedTools',
      'Read Edit Write Glob Grep',
      '--disallowedTools',
      'Bash',
    ],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 1024 * 1024 * 50 },
  )

  if (result.status !== 0) {
    return {
      ok: false,
      summary: `claude CLI exited with status ${result.status}: ${truncate(result.stderr ?? '', 2000)}`,
      costUsd: null,
    }
  }

  try {
    const parsed = JSON.parse(result.stdout)
    return {
      ok: !parsed.is_error,
      summary: parsed.result ?? '(agent returned no summary)',
      costUsd: parsed.total_cost_usd ?? null,
    }
  } catch {
    return { ok: true, summary: truncate(result.stdout, 2000), costUsd: null }
  }
}

async function main() {
  const iterations = []
  let current = runHarness()

  if (current.pass) {
    console.log('Harness is already green. Nothing to fix.')
  }

  for (let i = 1; i <= MAX_ITERATIONS && !current.pass; i++) {
    console.log(`\n--- Iteration ${i}/${MAX_ITERATIONS}: harness failing, invoking implementation agent ---`)
    const failureOutput = current.output
    const snapshotBeforeAgentRan = snapshotWorkingTree()
    const agent = runImplementationAgent(failureOutput)
    const { changed, forbidden } = enforceAllowedChanges(snapshotBeforeAgentRan)
    console.log(`  agent summary: ${agent.summary}`)
    if (agent.costUsd != null) console.log(`  cost: $${agent.costUsd.toFixed(4)}`)

    current = runHarness()
    iterations.push({
      iteration: i,
      failureOutput: truncate(failureOutput, 4000),
      agentOk: agent.ok,
      agentSummary: agent.summary,
      costUsd: agent.costUsd,
      filesChanged: changed,
      forbiddenChangesReverted: forbidden,
      resultAfterPatch: current.pass ? 'pass' : 'fail',
    })
    console.log(`  harness after patch: ${current.pass ? 'PASS' : 'FAIL'}`)
  }

  const finalStatus = current.pass ? 'green' : 'escalate_to_human'
  const log = {
    startedAt: new Date().toISOString(),
    maxIterations: MAX_ITERATIONS,
    iterationsRun: iterations.length,
    finalStatus,
    iterations,
  }

  mkdirSync(dirname(LOG_PATH), { recursive: true })
  writeFileSync(LOG_PATH, JSON.stringify(log, null, 2))

  console.log(`\n=== Loop finished: ${finalStatus} (${iterations.length} iteration(s)) ===`)
  console.log(`Log written to ${LOG_PATH}`)

  if (finalStatus !== 'green') {
    console.error('Iteration cap reached without a passing harness. Escalating to human review.')
    process.exit(1)
  }
}

main()
