import { formatTime } from '../formatTime'
import styles from './StatsBar.module.css'

interface StatsBarProps {
  moves: number
  elapsedMs: number
  onNewGame: () => void
}

export function StatsBar({ moves, elapsedMs, onNewGame }: StatsBarProps) {
  return (
    <div className={styles.stats}>
      <span data-testid="moves-counter">Moves: {moves}</span>
      <span data-testid="timer">Time: {formatTime(elapsedMs)}</span>
      <button type="button" onClick={onNewGame} data-testid="new-game-button">
        New Game
      </button>
    </div>
  )
}
