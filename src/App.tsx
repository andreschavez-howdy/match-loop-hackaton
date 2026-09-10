import { useEffect, useReducer, useState } from 'react'
import './App.css'
import {
  MISMATCH_DELAY_MS,
  createInitialState,
  createShuffledDeck,
  gameReducer,
} from './gameReducer'

const ICONS = ['🍎', '🍌', '🍇', '🍒', '🍋', '🍉', '🍓', '🍑']

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

function App() {
  const [state, dispatch] = useReducer(gameReducer, undefined, () => createInitialState())
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (state.status !== 'playing') return
    const interval = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(interval)
  }, [state.status])

  useEffect(() => {
    if (state.pendingIds.length !== 2) return
    const timeout = setTimeout(() => dispatch({ type: 'RESOLVE_MISMATCH' }), MISMATCH_DELAY_MS)
    return () => clearTimeout(timeout)
  }, [state.pendingIds])

  const elapsedMs =
    state.startedAt === null ? 0 : (state.endedAt ?? now) - state.startedAt

  function handleFlip(cardId: number) {
    dispatch({ type: 'FLIP_CARD', cardId, timestamp: Date.now() })
  }

  function handleNewGame() {
    dispatch({ type: 'NEW_GAME', cards: createShuffledDeck() })
  }

  return (
    <main className="game">
      <h1>MatchLoop</h1>

      <div className="stats">
        <span>Moves: {state.moves}</span>
        <span>Time: {formatTime(elapsedMs)}</span>
        <button type="button" onClick={handleNewGame}>
          New Game
        </button>
      </div>

      {state.status === 'won' && <p className="won-banner">You won in {state.moves} moves!</p>}

      <div className="board">
        {state.cards.map((card) => {
          const revealed = card.faceUp || card.matched
          return (
            <button
              key={card.id}
              type="button"
              className={`card${revealed ? ' revealed' : ''}${card.matched ? ' matched' : ''}`}
              onClick={() => handleFlip(card.id)}
              disabled={card.matched}
              aria-label={revealed ? `Card ${ICONS[card.pairId]}` : 'Hidden card'}
            >
              {revealed ? ICONS[card.pairId] : '?'}
            </button>
          )
        })}
      </div>
    </main>
  )
}

export default App
