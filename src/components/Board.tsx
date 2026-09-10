import type { Card as CardModel } from '../gameReducer'
import { Card } from './Card'
import styles from './Board.module.css'

interface BoardProps {
  cards: CardModel[]
  onFlip: (cardId: number) => void
}

export function Board({ cards, onFlip }: BoardProps) {
  return (
    <div className={styles.board} data-testid="board">
      {cards.map((card) => (
        <Card key={card.id} card={card} onFlip={onFlip} />
      ))}
    </div>
  )
}
