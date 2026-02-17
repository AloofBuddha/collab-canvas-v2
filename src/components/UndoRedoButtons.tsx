/**
 * UndoRedoButtons - Miro-style undo/redo controls
 *
 * Positioned bottom-left, separate from the center toolbar.
 * Buttons appear enabled (darker) when there's something to undo/redo,
 * and faded when the stack is empty.
 */

import { Undo2, Redo2 } from 'lucide-react'
import styles from './UndoRedoButtons.module.css'

interface UndoRedoButtonsProps {
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
}

export default function UndoRedoButtons({ onUndo, onRedo, canUndo, canRedo }: UndoRedoButtonsProps) {
  return (
    <div className={styles.container}>
      <button
        onClick={onUndo}
        disabled={!canUndo}
        className={`${styles.button} ${canUndo ? styles.enabled : ''}`}
        title="Undo (Ctrl+Z)"
        aria-label="Undo"
      >
        <Undo2 size={18} />
      </button>
      <button
        onClick={onRedo}
        disabled={!canRedo}
        className={`${styles.button} ${canRedo ? styles.enabled : ''}`}
        title="Redo (Ctrl+Shift+Z)"
        aria-label="Redo"
      >
        <Redo2 size={18} />
      </button>
    </div>
  )
}
