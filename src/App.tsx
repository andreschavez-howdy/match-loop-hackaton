import { useEffect, useReducer, useState } from 'react'
import styles from './App.module.css'
import { Board } from './components/Board'
import { StatsBar } from './components/StatsBar'
import { WinOverlay } from './components/WinOverlay'
import {
  MISMATCH_DELAY_MS,
  createInitialState,
  createShuffledDeck,
  gameReducer,
} from './gameReducer'

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

  useEffect(() => {
    if (!import.meta.env.DEV) return
    let disposed = false
    import('./testFixtures').then(({ buildFixtureState }) => {
      if (disposed) return
      window.__seedBoard = (fixture) => {
        dispatch({ type: 'SEED_BOARD', state: buildFixtureState(fixture) })
      }
    })
    return () => {
      disposed = true
      window.__seedBoard = undefined
    }
  }, [])

  const elapsedMs = state.startedAt === null ? 0 : (state.endedAt ?? now) - state.startedAt

  function handleFlip(cardId: number) {
    dispatch({ type: 'FLIP_CARD', cardId, timestamp: Date.now() })
  }

  function handleNewGame() {
    dispatch({ type: 'NEW_GAME', cards: createShuffledDeck() })
  }

  return (
    <main className={styles.game}>
      <h1>MatchLoop</h1>
      <StatsBar moves={state.moves} elapsedMs={elapsedMs} onNewGame={handleNewGame} />
      <Board cards={state.cards} onFlip={handleFlip} />
      {state.status === 'won' && (
        <WinOverlay moves={state.moves} elapsedMs={elapsedMs} onNewGame={handleNewGame} />
      )}
    </main>
  )
}

export default App
