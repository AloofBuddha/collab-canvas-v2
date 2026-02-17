/**
 * boardStorage tests
 *
 * These test the localStorage-backed board tracking used by the Dashboard.
 * Worth testing because: sorting by lastVisitedAt, dedup on addBoard,
 * ownership split, and CRUD correctness directly affect what the user sees.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  getBoards,
  getOwnedBoards,
  getVisitedBoards,
  addBoard,
  visitBoard,
  updateBoardTitle,
  removeBoard,
} from '../../src/utils/boardStorage'

const STORAGE_KEY = 'collabboard-boards'

beforeEach(() => {
  localStorage.clear()
})

describe('addBoard', () => {
  // Core creation — does the board get stored correctly?
  it('creates a new board entry', () => {
    const board = addBoard('abc123', 'My Board', true)
    expect(board.id).toBe('abc123')
    expect(board.title).toBe('My Board')
    expect(board.ownedByMe).toBe(true)
    expect(board.createdAt).toBeGreaterThan(0)
    expect(board.lastVisitedAt).toBe(board.createdAt)
  })

  // Visiting the same board should bump the timestamp, not create a dupe
  it('updates lastVisitedAt if board already exists', () => {
    const first = addBoard('abc123', 'My Board')
    const second = addBoard('abc123', 'My Board')
    expect(second.lastVisitedAt).toBeGreaterThanOrEqual(first.lastVisitedAt)
  })

  // Board title can be updated via addBoard (e.g. syncing from Yjs)
  it('updates title if a new title is provided for existing board', () => {
    addBoard('abc123', 'Old Title')
    addBoard('abc123', 'New Title')
    const boards = getBoards()
    expect(boards[0].title).toBe('New Title')
  })

  // Default ownership is false (visited boards)
  it('defaults ownedByMe to false', () => {
    const board = addBoard('abc123', 'Board')
    expect(board.ownedByMe).toBe(false)
  })

  // Explicit ownership flag
  it('respects ownedByMe parameter', () => {
    const owned = addBoard('a', 'Mine', true)
    const visited = addBoard('b', 'Theirs', false)
    expect(owned.ownedByMe).toBe(true)
    expect(visited.ownedByMe).toBe(false)
  })

  // Re-adding an existing board should NOT change its ownership
  it('does not change ownedByMe when revisiting existing board', () => {
    addBoard('a', 'Mine', true)
    addBoard('a', 'Mine', false) // revisit shouldn't flip ownership
    expect(getBoards()[0].ownedByMe).toBe(true)
  })
})

describe('getBoards', () => {
  it('returns empty array when no boards stored', () => {
    expect(getBoards()).toEqual([])
  })

  // Dashboard lists boards most-recent first
  it('returns boards sorted by lastVisitedAt (most recent first)', () => {
    const boards = [
      { id: 'old', title: 'Old', createdAt: 1000, lastVisitedAt: 1000, ownedByMe: true },
      { id: 'new', title: 'New', createdAt: 2000, lastVisitedAt: 3000, ownedByMe: true },
      { id: 'mid', title: 'Mid', createdAt: 1500, lastVisitedAt: 2000, ownedByMe: true },
    ]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(boards))

    const result = getBoards()
    expect(result.map((b) => b.id)).toEqual(['new', 'mid', 'old'])
  })

  it('handles corrupted localStorage gracefully', () => {
    localStorage.setItem(STORAGE_KEY, 'not-json{{{')
    expect(getBoards()).toEqual([])
  })
})

describe('getOwnedBoards / getVisitedBoards', () => {
  // Dashboard splits boards into two sections based on ownership
  it('separates boards by ownership', () => {
    addBoard('a', 'Mine', true)
    addBoard('b', 'Theirs', false)
    expect(getOwnedBoards().map((b) => b.id)).toEqual(['a'])
    expect(getVisitedBoards().map((b) => b.id)).toEqual(['b'])
  })
})

describe('visitBoard', () => {
  it('updates lastVisitedAt for an existing board', () => {
    addBoard('abc123', 'Test')
    const before = getBoards()[0].lastVisitedAt
    visitBoard('abc123')
    const after = getBoards()[0].lastVisitedAt
    expect(after).toBeGreaterThanOrEqual(before)
  })

  it('does nothing for a non-existent board', () => {
    addBoard('abc123', 'Test')
    visitBoard('nonexistent')
    expect(getBoards()).toHaveLength(1)
  })
})

describe('updateBoardTitle', () => {
  // When Yjs provides the real title, localStorage should be updated
  it('updates title for existing board', () => {
    addBoard('a', 'Old', true)
    updateBoardTitle('a', 'New')
    expect(getBoards()[0].title).toBe('New')
  })

  // Syncing title from Yjs should not affect ownership
  it('preserves ownedByMe when updating title', () => {
    addBoard('a', 'Placeholder', false)
    updateBoardTitle('a', 'Real Title From Yjs')
    const board = getBoards()[0]
    expect(board.title).toBe('Real Title From Yjs')
    expect(board.ownedByMe).toBe(false)
  })

  it('does nothing for a non-existent board', () => {
    addBoard('a', 'Name')
    updateBoardTitle('nonexistent', 'Nope')
    expect(getBoards()[0].title).toBe('Name')
  })
})

describe('removeBoard', () => {
  it('removes a board by id', () => {
    addBoard('a', 'Board A')
    addBoard('b', 'Board B')
    removeBoard('a')
    const boards = getBoards()
    expect(boards).toHaveLength(1)
    expect(boards[0].id).toBe('b')
  })

  it('does nothing if id does not exist', () => {
    addBoard('a', 'Board A')
    removeBoard('nonexistent')
    expect(getBoards()).toHaveLength(1)
  })
})

describe('migration', () => {
  // Pre-ownership localStorage entries should default to owned (they were created locally)
  it('treats boards without ownedByMe as owned (legacy data)', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([
      { id: 'old', title: 'Legacy', createdAt: 1000, lastVisitedAt: 1000 },
    ]))
    const boards = getBoards()
    expect(boards[0].ownedByMe).toBe(true)
  })
})
