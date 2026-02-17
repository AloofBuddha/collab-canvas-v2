/**
 * Board metadata storage (localStorage)
 *
 * Since boards live on PartyKit (no server-side listing), we track
 * boards the user has created/visited in localStorage.
 * Ownership: boards created by this user have ownedByMe=true,
 * boards visited from other users have ownedByMe=false.
 */

export interface BoardMeta {
  id: string
  title: string
  createdAt: number
  lastVisitedAt: number
  ownedByMe: boolean
}

const STORAGE_KEY = 'collabboard-boards'

function loadBoards(): BoardMeta[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const boards: BoardMeta[] = raw ? JSON.parse(raw) : []
    // Migrate pre-ownership data: boards without ownedByMe were all created locally
    for (const b of boards) {
      if (b.ownedByMe === undefined) b.ownedByMe = true
    }
    return boards
  } catch {
    return []
  }
}

function saveBoards(boards: BoardMeta[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(boards))
}

export function getBoards(): BoardMeta[] {
  return loadBoards().sort((a, b) => b.lastVisitedAt - a.lastVisitedAt)
}

export function getOwnedBoards(): BoardMeta[] {
  return getBoards().filter((b) => b.ownedByMe)
}

export function getVisitedBoards(): BoardMeta[] {
  return getBoards().filter((b) => !b.ownedByMe)
}

export function addBoard(id: string, title: string, ownedByMe = false): BoardMeta {
  const boards = loadBoards()
  const now = Date.now()
  const existing = boards.find((b) => b.id === id)
  if (existing) {
    existing.lastVisitedAt = now
    if (title && title !== existing.title) existing.title = title
    saveBoards(boards)
    return existing
  }
  const board: BoardMeta = { id, title, createdAt: now, lastVisitedAt: now, ownedByMe }
  boards.push(board)
  saveBoards(boards)
  return board
}

export function visitBoard(id: string): void {
  const boards = loadBoards()
  const board = boards.find((b) => b.id === id)
  if (board) {
    board.lastVisitedAt = Date.now()
    saveBoards(boards)
  }
}

export function updateBoardTitle(id: string, title: string): void {
  const boards = loadBoards()
  const board = boards.find((b) => b.id === id)
  if (board && board.title !== title) {
    board.title = title
    saveBoards(boards)
  }
}

export function removeBoard(id: string): void {
  const boards = loadBoards().filter((b) => b.id !== id)
  saveBoards(boards)
}
