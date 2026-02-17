/**
 * Dashboard - Board listing and creation page
 *
 * Tracks boards in localStorage (no server-side board listing with PartyKit).
 * Shows two sections: owned boards (deletable) and recently visited boards.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import { getOwnedBoards, getVisitedBoards, addBoard, removeBoard, type BoardMeta } from '../utils/boardStorage'
import { signOut } from '../utils/auth'
import CreateBoardModal from './CreateBoardModal'
import type { User } from '../types'
import styles from './Dashboard.module.css'

interface DashboardProps {
  user: User
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

export function Dashboard({ user }: DashboardProps) {
  const navigate = useNavigate()
  const [ownedBoards, setOwnedBoards] = useState<BoardMeta[]>(getOwnedBoards)
  const [visitedBoards, setVisitedBoards] = useState<BoardMeta[]>(getVisitedBoards)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const handleCreate = (title: string) => {
    const boardId = crypto.randomUUID().slice(0, 8)
    addBoard(boardId, title, true)
    setIsModalOpen(false)
    navigate(`/board/${boardId}`)
  }

  const handleDelete = (e: React.MouseEvent, boardId: string) => {
    e.stopPropagation()
    removeBoard(boardId)
    setOwnedBoards(getOwnedBoards())
    setVisitedBoards(getVisitedBoards())
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.logo}>CollabBoard</h1>
        </div>
        <div className={styles.headerRight}>
          <span className={styles.userName}>{user.displayName}</span>
          <button onClick={() => signOut()} className={styles.signOutButton}>
            Sign Out
          </button>
        </div>
      </header>

      <main className={styles.content}>
        <div className={styles.topRow}>
          <h2 className={styles.pageTitle}>Your Boards</h2>
          <button onClick={() => setIsModalOpen(true)} className={styles.newBoardButton}>
            <Plus size={16} />
            New Board
          </button>
        </div>

        {ownedBoards.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyTitle}>No boards yet</p>
            <p className={styles.emptyDescription}>
              Create your first board to get started collaborating.
            </p>
          </div>
        ) : (
          <div className={styles.boardGrid}>
            {ownedBoards.map((board) => (
              <div
                key={board.id}
                className={styles.boardCard}
                onClick={() => navigate(`/board/${board.id}`)}
              >
                <h3 className={styles.boardTitle}>{board.title}</h3>
                <p className={styles.boardMeta}>
                  Last opened {formatDate(board.lastVisitedAt)}
                </p>
                <div className={styles.boardActions}>
                  <button
                    className={`${styles.actionButton} ${styles.deleteButton}`}
                    onClick={(e) => handleDelete(e, board.id)}
                    title="Remove from list"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {visitedBoards.length > 0 && (
          <>
            <h2 className={styles.sectionTitle}>Recently Visited</h2>
            <div className={styles.boardGrid}>
              {visitedBoards.map((board) => (
                <div
                  key={board.id}
                  className={styles.boardCard}
                  onClick={() => navigate(`/board/${board.id}`)}
                >
                  <h3 className={styles.boardTitle}>{board.title}</h3>
                  <p className={styles.boardMeta}>
                    Last opened {formatDate(board.lastVisitedAt)}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </main>

      <CreateBoardModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreate={handleCreate}
      />
    </div>
  )
}
