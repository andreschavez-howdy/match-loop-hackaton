#!/usr/bin/env node
// Deliberately reintroduces a real regression into gameReducer.ts so the
// autonomous loop has something genuine to detect and fix. Used to produce
// reproducible end-to-end evidence of the loop, not a simulated run.
//
// Usage: node scripts/demo/inject-bug.mjs

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const TARGET = join(ROOT, 'src', 'gameReducer.ts')

// Removes the guard for required edge case #1: "a third card clicked while
// two cards are pending resolution must be ignored."
const NEEDLE = '  if (state.pendingIds.length === 2) return state\n'

const source = readFileSync(TARGET, 'utf8')
if (!source.includes(NEEDLE)) {
  console.error('Expected guard not found -- gameReducer.ts may already be patched or has changed shape.')
  process.exit(1)
}

writeFileSync(TARGET, source.replace(NEEDLE, ''))
console.log(`Injected demo bug into ${TARGET}: removed the "third card while pending" guard.`)
console.log('Run `npm run loop` to watch the autonomous loop detect and fix it.')
