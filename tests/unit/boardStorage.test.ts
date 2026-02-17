/**
 * boardStorage tests
 *
 * These test the localStorage-backed board tracking used by the Dashboard.
 * Worth testing because: sorting by lastVisitedAt, dedup on addBoard,
 * and CRUD correctness directly affect what the user sees on the dashboard.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { getBoards, addBoard, visitBoard, removeBoard, renameBoard } from '../../src/utils/boardStorage'

const STORAGE_KEY = 'collabboard-boards'

beforeEach(() => {
  localStorage.clear()
})

describe('addBoard', () => {
  it('creates a new board entry', () => {
    const board = addBoard('abc123', 'My Board')
    expect(board.id).toBe('abc123')
    expect(board.title).toBe('My Board')
    expect(board.createdAt).toBeGreaterThan(0)
    expect(board.lastVisitedAt).toBe(board.createdAt)
  })

  it('updates lastVisitedAt if board already exists', () => {
    const first = addBoard('abc123', 'My Board')
    // Small delay to ensure timestamp differs
    const second = addBoard('abc123', 'My Board')
    expect(second.lastVisitedAt).toBeGreaterThanOrEqual(first.lastVisitedAt)
  })

  it('updates title if a new title is provided for existing board', () => {
    addBoard('abc123', 'Old Title')
    addBoard('abc123', 'New Title')
    const boards = getBoards()
    expect(boards[0].title).toBe('New Title')
  })
})

describe('getBoards', () => {
  it('returns empty array when no boards stored', () => {
    expect(getBoards()).toEqual([])
  })

  it('returns boards sorted by lastVisitedAt (most recent first)', () => {
    // Manually write boards with known timestamps to guarantee order
    const boards = [
      { id: 'old', title: 'Old', createdAt: 1000, lastVisitedAt: 1000 },
      { id: 'new', title: 'New', createdAt: 2000, lastVisitedAt: 3000 },
      { id: 'mid', title: 'Mid', createdAt: 1500, lastVisitedAt: 2000 },
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

describe('renameBoard', () => {
  it('renames an existing board', () => {
    addBoard('a', 'Old Name')
    renameBoard('a', 'New Name')
    expect(getBoards()[0].title).toBe('New Name')
  })

  it('does nothing for a non-existent board', () => {
    addBoard('a', 'Name')
    renameBoard('nonexistent', 'Nope')
    expect(getBoards()[0].title).toBe('Name')
  })
})
