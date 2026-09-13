import { PAIR_COUNT, type Card, type GameState } from './gameReducer'

// Sequential pairing (id 0&1 share pairId 0, id 2&3 share pairId 1, ...) so every
// fixture below is deterministic and independent of the shuffle used in production.
const FIXTURE_LAYOUT: number[] = Array.from({ length: PAIR_COUNT }, (_, pairId) => pairId).flatMap(
  (pairId) => [pairId, pairId],
)

function buildCards(): Card[] {
  return FIXTURE_LAYOUT.map((pairId, id) => ({ id, pairId, faceUp: false, matched: false }))
}

export const FIXTURE_NAMES = ['fresh-board', 'pending-mismatch', 'one-pair-left'] as const
export type FixtureName = (typeof FIXTURE_NAMES)[number]

declare global {
  interface Window {
    __seedBoard?: (fixture: FixtureName) => void
  }
}

export function buildFixtureState(name: FixtureName): GameState {
  switch (name) {
    case 'fresh-board':
      return {
        cards: buildCards(),
        pendingIds: [],
        moves: 0,
        status: 'idle',
        startedAt: null,
        endedAt: null,
      }

    case 'pending-mismatch': {
      // Cards 0 and 2 belong to different pairs (0 and 1): flipped face up,
      // mismatched, and awaiting the RESOLVE_MISMATCH timeout. startedAt is
      // relative to the real clock (not a fixed constant like `1_000`)
      // because this state gets loaded into the live app, where the
      // displayed timer keeps ticking against real Date.now() -- a fixed
      // startedAt from 1970 would show a nonsensical multi-million-minute
      // elapsed time on screen.
      const cards = buildCards().map((c) => (c.id === 0 || c.id === 2 ? { ...c, faceUp: true } : c))
      return {
        cards,
        pendingIds: [0, 2],
        moves: 1,
        status: 'playing',
        startedAt: Date.now() - 2_000,
        endedAt: null,
      }
    }

    case 'one-pair-left': {
      // The first 7 pairs (ids 0-13) are already matched; only the last pair
      // (ids 14 and 15, pairId 7) remains face-down and unmatched.
      const cards = buildCards().map((c) =>
        c.id < 14 ? { ...c, faceUp: true, matched: true } : c,
      )
      return {
        cards,
        pendingIds: [],
        moves: 7,
        status: 'playing',
        startedAt: Date.now() - 30_000,
        endedAt: null,
      }
    }
  }
}
