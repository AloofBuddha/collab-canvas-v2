/**
 * CreateBoardModal — simple modal for naming a new board.
 *
 * Opens over the Dashboard, auto-focuses the input.
 * Submit creates the board, Escape/backdrop click cancels.
 */

import { useState, useCallback } from 'react'
import styles from './CreateBoardModal.module.css'

interface CreateBoardModalProps {
  isOpen: boolean
  onClose: () => void
  onCreate: (title: string) => void
}

export default function CreateBoardModal({ isOpen, onClose, onCreate }: CreateBoardModalProps) {
  const [title, setTitle] = useState('')

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    onCreate(title.trim() || 'Untitled Board')
  }, [title, onCreate])

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }, [onClose])

  if (!isOpen) return null

  return (
    <div className={styles.overlay} onClick={handleBackdropClick}>
      <div className={styles.modal}>
        <h2 className={styles.heading}>Create New Board</h2>
        <form onSubmit={handleSubmit}>
          <input
            autoFocus
            className={styles.input}
            type="text"
            placeholder="Board name"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={100}
            onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
          />
          <div className={styles.actions}>
            <button type="button" className={styles.cancelButton} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className={styles.createButton}>
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
