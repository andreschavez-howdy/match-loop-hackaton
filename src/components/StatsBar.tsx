import styles from './StatsBar.module.css'

interface StatsBarProps {
  moves: number
  elapsedMs: number
  onNewGame: () => void
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
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
