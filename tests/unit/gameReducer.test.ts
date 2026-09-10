import { describe, expect, it } from 'vitest'
import {
  BOARD_SIZE,
  PAIR_COUNT,
  type Card,
  type GameState,
  createInitialState,
  createShuffledDeck,
  gameReducer,
} from '../../src/gameReducer'

function buildState(pairIds: number[]): GameState {
  const cards: Card[] = pairIds.map((pairId, id) => ({
    id,
    pairId,
    faceUp: false,
    matched: false,
  }))
  return createInitialState(cards)
}

function flip(state: GameState, cardId: number, timestamp: number): GameState {
  return gameReducer(state, { type: 'FLIP_CARD', cardId, timestamp })
}

describe('createShuffledDeck', () => {
  it('builds a full board of pairs and applies the given random source deterministically', () => {
    let calls = 0
    const fixedRandom = () => {
      calls += 1
      return 0
    }
    const deck = createShuffledDeck(fixedRandom)

    expect(deck).toHaveLength(BOARD_SIZE)
    expect(calls).toBeGreaterThan(0)

    const pairCounts = new Map<number, number>()
    for (const card of deck) {
      pairCounts.set(card.pairId, (pairCounts.get(card.pairId) ?? 0) + 1)
      expect(card.faceUp).toBe(false)
      expect(card.matched).toBe(false)
    }
    expect(pairCounts.size).toBe(PAIR_COUNT)
    for (const count of pairCounts.values()) {
      expect(count).toBe(2)
    }
  })
})

describe('gameReducer', () => {
  it('replaces the entire state on SEED_BOARD', () => {
    const state = buildState([0, 0, 1, 1])
    const seeded: GameState = {
      cards: state.cards.map((c) => ({ ...c, faceUp: true })),
      pendingIds: [],
      moves: 3,
      status: 'playing',
      startedAt: 500,
      endedAt: null,
    }

    const next = gameReducer(state, { type: 'SEED_BOARD', state: seeded })

    expect(next).toBe(seeded)
  })

  it('returns the same state for an unknown action', () => {
    const state = buildState([0, 0, 1, 1])
    // @ts-expect-error intentionally invalid action to exercise the default branch
    const next = gameReducer(state, { type: 'NOOP' })
    expect(next).toBe(state)
  })

  it('flips a card face up on first click and starts the timer', () => {
    const state = buildState([0, 0, 1, 1])
    const next = flip(state, 0, 1000)

    expect(next.cards[0].faceUp).toBe(true)
    expect(next.status).toBe('playing')
    expect(next.startedAt).toBe(1000)
  })

  it('marks a pair matched and increments moves on a match', () => {
    let state = buildState([0, 0, 1, 1])
    state = flip(state, 0, 1000)
    state = flip(state, 1, 1200)

    expect(state.moves).toBe(1)
    expect(state.cards[0].matched).toBe(true)
    expect(state.cards[1].matched).toBe(true)
    expect(state.pendingIds).toEqual([])
  })

  it('holds a mismatched pair face up as pending and increments moves', () => {
    let state = buildState([0, 0, 1, 1])
    state = flip(state, 0, 1000)
    state = flip(state, 2, 1200)

    expect(state.moves).toBe(1)
    expect(state.cards[0].faceUp).toBe(true)
    expect(state.cards[2].faceUp).toBe(true)
    expect(state.cards[0].matched).toBe(false)
    expect(state.pendingIds).toEqual([0, 2])
  })

  it('flips a mismatched pair back down on RESOLVE_MISMATCH', () => {
    let state = buildState([0, 0, 1, 1])
    state = flip(state, 0, 1000)
    state = flip(state, 2, 1200)
    state = gameReducer(state, { type: 'RESOLVE_MISMATCH' })

    expect(state.cards[0].faceUp).toBe(false)
    expect(state.cards[2].faceUp).toBe(false)
    expect(state.pendingIds).toEqual([])
  })

  it('edge case: ignores a third card clicked while a mismatched pair is pending', () => {
    let state = buildState([0, 0, 1, 1, 2, 2])
    state = flip(state, 0, 1000)
    state = flip(state, 2, 1200) // mismatch, now pending [0, 2]
    const pending = state

    const next = flip(state, 4, 1300)

    expect(next).toBe(pending)
    expect(next.cards[4].faceUp).toBe(false)
    expect(next.moves).toBe(1)
  })

  it('edge case: clicking an already-matched card is a no-op', () => {
    let state = buildState([0, 0, 1, 1])
    state = flip(state, 0, 1000)
    state = flip(state, 1, 1200) // matched
    const matched = state

    const next = flip(state, 0, 1300)

    expect(next).toBe(matched)
    expect(next.moves).toBe(1)
  })

  it('edge case: rapid double-click on the same card does not count as a pair', () => {
    let state = buildState([0, 0, 1, 1])
    state = flip(state, 0, 1000)
    const onceFlipped = state

    const next = flip(state, 0, 1005)

    expect(next).toBe(onceFlipped)
    expect(next.moves).toBe(0)
    expect(next.pendingIds).toEqual([])
  })

  it('edge case: the timer stops on the exact move that completes the last pair', () => {
    let state = buildState([0, 0, 1, 1])
    state = flip(state, 0, 1000)
    state = flip(state, 1, 1500) // first pair matched, game not won yet

    expect(state.status).toBe('playing')
    expect(state.endedAt).toBeNull()

    state = flip(state, 2, 2000)
    state = flip(state, 3, 2500) // completes the last pair

    expect(state.status).toBe('won')
    expect(state.endedAt).toBe(2500)

    const afterWin = flip(state, 0, 3000)
    expect(afterWin).toBe(state)
    expect(afterWin.endedAt).toBe(2500)
  })

  it('edge case: New Game mid-round leaves no stale state from the previous round', () => {
    let state = buildState([0, 0, 1, 1, 2, 2])
    state = flip(state, 0, 1000)
    state = flip(state, 1, 1200) // matched pair
    state = flip(state, 2, 1400) // pending mismatch half

    const freshDeck: Card[] = [0, 1, 0, 1].map((pairId, id) => ({
      id,
      pairId,
      faceUp: false,
      matched: false,
    }))
    const next = gameReducer(state, { type: 'NEW_GAME', cards: freshDeck })

    expect(next.cards).toEqual(freshDeck)
    expect(next.moves).toBe(0)
    expect(next.pendingIds).toEqual([])
    expect(next.status).toBe('idle')
    expect(next.startedAt).toBeNull()
    expect(next.endedAt).toBeNull()
  })
})
