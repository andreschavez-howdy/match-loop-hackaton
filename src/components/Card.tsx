import type { Card as CardModel } from '../gameReducer'
import styles from './Card.module.css'

const ICONS = ['🍎', '🍌', '🍇', '🍒', '🍋', '🍉', '🍓', '🍑']

interface CardProps {
  card: CardModel
  onFlip: (cardId: number) => void
}

export function Card({ card, onFlip }: CardProps) {
  const revealed = card.faceUp || card.matched

  return (
    <button
      type="button"
      className={`${styles.card} ${revealed ? styles.revealed : ''} ${card.matched ? styles.matched : ''}`}
      onClick={() => onFlip(card.id)}
      disabled={card.matched}
      data-testid="card"
      data-card-id={card.id}
      data-matched={card.matched}
      data-face-up={card.faceUp}
      aria-label={revealed ? `Card ${ICONS[card.pairId]}` : 'Hidden card'}
    >
      {revealed ? ICONS[card.pairId] : '?'}
    </button>
  )
}
