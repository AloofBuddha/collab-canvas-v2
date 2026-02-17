/**
 * Board metadata storage (localStorage)
 *
 * Since boards live on PartyKit (no server-side listing), we track
 * boards the user has created/visited in localStorage.
 */

export interface BoardMeta {
  id: string
  title: string
  createdAt: number
  lastVisitedAt: number
}

const STORAGE_KEY = 'collabboard-boards'

function loadBoards(): BoardMeta[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
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

export function addBoard(id: string, title: string): BoardMeta {
  const boards = loadBoards()
  const now = Date.now()
  const existing = boards.find((b) => b.id === id)
  if (existing) {
    existing.lastVisitedAt = now
    if (title && title !== existing.title) existing.title = title
    saveBoards(boards)
    return existing
  }
  const board: BoardMeta = { id, title, createdAt: now, lastVisitedAt: now }
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

export function removeBoard(id: string): void {
  const boards = loadBoards().filter((b) => b.id !== id)
  saveBoards(boards)
}

export function renameBoard(id: string, title: string): void {
  const boards = loadBoards()
  const board = boards.find((b) => b.id === id)
  if (board) {
    board.title = title
    saveBoards(boards)
  }
}
