import { useState } from 'react'
import { formatTime } from '../formatTime'
import styles from './WinOverlay.module.css'

interface WinOverlayProps {
  moves: number
  elapsedMs: number
  onNewGame: () => void
}

const CONFETTI_COUNT = 24
const CONFETTI_COLORS = ['#e57373', '#64b5f6', '#81c784', '#ffd54f', '#ba68c8', '#4dd0e1']

interface ConfettiPiece {
  id: number
  left: number
  delay: number
  duration: number
  color: string
  rotate: number
}

function createConfetti(count: number): ConfettiPiece[] {
  return Array.from({ length: count }, (_, id) => ({
    id,
    left: Math.random() * 100,
    delay: Math.random() * 0.4,
    duration: 1.6 + Math.random() * 0.8,
    color: CONFETTI_COLORS[id % CONFETTI_COLORS.length],
    rotate: Math.random() * 360,
  }))
}

export function WinOverlay({ moves, elapsedMs, onNewGame }: WinOverlayProps) {
  const [pieces] = useState(() => createConfetti(CONFETTI_COUNT))

  return (
    <div className={styles.overlay} data-testid="win-banner">
      <div className={styles.confettiField} aria-hidden="true">
        {pieces.map((piece) => (
          <span
            key={piece.id}
            className={styles.confetti}
            style={{
              left: `${piece.left}%`,
              backgroundColor: piece.color,
              animationDelay: `${piece.delay}s`,
              animationDuration: `${piece.duration}s`,
              transform: `rotate(${piece.rotate}deg)`,
            }}
          />
        ))}
      </div>
      <div className={styles.modal}>
        <p className={styles.trophy}>🏆</p>
        <h2>You won!</h2>
        <p className={styles.stats}>
          {moves} moves · {formatTime(elapsedMs)}
        </p>
        <button type="button" onClick={onNewGame}>
          Play again
        </button>
      </div>
    </div>
  )
}
