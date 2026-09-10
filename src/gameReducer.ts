export const PAIR_COUNT = 8
export const BOARD_SIZE = PAIR_COUNT * 2
export const MISMATCH_DELAY_MS = 800

export interface Card {
  id: number
  pairId: number
  faceUp: boolean
  matched: boolean
}

export type GameStatus = 'idle' | 'playing' | 'won'

export interface GameState {
  cards: Card[]
  pendingIds: number[]
  moves: number
  status: GameStatus
  startedAt: number | null
  endedAt: number | null
}

export type GameAction =
  | { type: 'FLIP_CARD'; cardId: number; timestamp: number }
  | { type: 'RESOLVE_MISMATCH' }
  | { type: 'NEW_GAME'; cards: Card[] }

export function createShuffledDeck(random: () => number = Math.random): Card[] {
  const pairIds = Array.from({ length: PAIR_COUNT }, (_, i) => i)
  const values = [...pairIds, ...pairIds]
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[values[i], values[j]] = [values[j], values[i]]
  }
  return values.map((pairId, id) => ({ id, pairId, faceUp: false, matched: false }))
}

export function createInitialState(cards: Card[] = createShuffledDeck()): GameState {
  return {
    cards,
    pendingIds: [],
    moves: 0,
    status: 'idle',
    startedAt: null,
    endedAt: null,
  }
}

function flipCard(state: GameState, cardId: number, timestamp: number): GameState {
  if (state.status === 'won') return state

  const card = state.cards.find((c) => c.id === cardId)
  if (!card) return state
  if (card.matched) return state
  if (card.faceUp) return state
  if (state.pendingIds.length === 2) return state

  const cards = state.cards.map((c) => (c.id === cardId ? { ...c, faceUp: true } : c))
  const startedAt = state.startedAt ?? timestamp

  const otherFaceUpUnmatched = state.cards.find((c) => c.faceUp && !c.matched)
  if (!otherFaceUpUnmatched) {
    return { ...state, cards, status: 'playing', startedAt }
  }

  const moves = state.moves + 1
  const isMatch = otherFaceUpUnmatched.pairId === card.pairId

  if (isMatch) {
    const matchedCards = cards.map((c) =>
      c.id === cardId || c.id === otherFaceUpUnmatched.id ? { ...c, matched: true } : c,
    )
    const allMatched = matchedCards.every((c) => c.matched)
    return {
      ...state,
      cards: matchedCards,
      moves,
      startedAt,
      status: allMatched ? 'won' : 'playing',
      endedAt: allMatched ? timestamp : null,
      pendingIds: [],
    }
  }

  return {
    ...state,
    cards,
    moves,
    startedAt,
    status: 'playing',
    pendingIds: [otherFaceUpUnmatched.id, cardId],
  }
}

function resolveMismatch(state: GameState): GameState {
  if (state.pendingIds.length !== 2) return state
  const [a, b] = state.pendingIds
  const cards = state.cards.map((c) => (c.id === a || c.id === b ? { ...c, faceUp: false } : c))
  return { ...state, cards, pendingIds: [] }
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'FLIP_CARD':
      return flipCard(state, action.cardId, action.timestamp)
    case 'RESOLVE_MISMATCH':
      return resolveMismatch(state)
    case 'NEW_GAME':
      return createInitialState(action.cards)
    default:
      return state
  }
}
