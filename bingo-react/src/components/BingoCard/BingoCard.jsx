import './BingoCard.css'
import { getCardCell } from '../../utils/bingoCardGenerator'

const BingoCard = ({ card, compact = false, interactive = false, onCellClick, matrixVersion }) => {
  const { matrix, markedCells } = card
  const cardMatrixVersion = card.matrixVersion || matrixVersion

  const isMarked = (row, col) => {
    return (markedCells || []).some((m) => {
      if (Array.isArray(m)) return m[0] === row && m[1] === col
      if (m && typeof m === 'object') return m.row === row && m.col === col
      return false
    })
  }

  const letters = ['B', 'I', 'N', 'G', 'O']

  return (
    <div className={`bingo-card ${compact ? 'bingo-card-compact' : ''}`}>
      {/* Header con letras B-I-N-G-O */}
      <div className="bingo-header">
        {letters.map((letter) => (
          <div key={letter} className={`bingo-letter bingo-letter-${letter}`}>{letter}</div>
        ))}
      </div>

      {/* Grid 5x5 */}
      <div className="bingo-grid">
        {Array.from({ length: 5 }, (_, rowIndex) => (
          <div key={rowIndex} className="bingo-row">
            {Array.from({ length: 5 }, (_, colIndex) => {
              const cell = getCardCell(matrix, rowIndex, colIndex, cardMatrixVersion)
              const marked = isMarked(rowIndex, colIndex)
              const isFree = cell === 'BINGO'
              const handleClick = () => {
                if (!interactive || isFree) return
                if (onCellClick) onCellClick(rowIndex, colIndex, cell)
              }
              return (
                <div
                  onClick={handleClick}
                  key={`${rowIndex}-${colIndex}`}
                  data-testid="bingo-card-cell"
                  data-row={rowIndex}
                  data-col={colIndex}
                  data-value={cell}
                  className={`bingo-cell ${marked ? 'marked' : ''} ${isFree ? 'free' : ''} ${interactive && !isFree ? 'clickable' : ''}`}
                >
                  {isFree ? <span className="free-text">BINGO</span> : <span className="cell-number">{cell}</span>}
                  {marked && <div className="mark-overlay">✓</div>}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

export default BingoCard;
