/**
 * Global Keyboard Shortcuts Hook
 *
 * Handles keyboard shortcuts for the canvas:
 * - Delete/Backspace: Delete selected shape(s)
 * - Ctrl/Cmd+D: Duplicate selected shape(s) (offset by 10px)
 * - Ctrl/Cmd+Z: Undo (via Yjs UndoManager)
 * - Ctrl/Cmd+Shift+Z / Ctrl/Cmd+Y: Redo (via Yjs UndoManager)
 * - Arrow keys: Nudge selected shape(s) by 1px (10px with Shift)
 * - Escape: Deselect all and switch to select tool
 * - Ctrl/Cmd+A: Select all shapes
 * - ] : Bring selected shape to front (highest zIndex)
 * - [ : Send selected shape to back (lowest zIndex)
 * - Ctrl/Cmd+] : Bring selected shape forward one step
 * - Ctrl/Cmd+[ : Send selected shape backward one step
 * - Ctrl/Cmd+0: Reset zoom to 100%
 *
 * V2 approach: operates directly on Yjs via useBoard callbacks (addShape,
 * updateShape, removeShape). No local stores or Firebase persistence needed.
 */

import { useEffect, useRef } from 'react'
import type { Shape, Tool } from '../types'

interface UseKeyboardShortcutsOptions {
  shapes: Record<string, Shape>
  selectedShapeIds: Set<string>
  selectedShapeId: string | null
  deselectAll: () => void
  selectAll: (shapes: Record<string, Shape>) => void
  setSelectedShapeIds: (ids: Set<string>) => void
  setTool: (tool: Tool) => void
  addShape: (shape: Shape) => void
  updateShape: (id: string, updates: Partial<Shape>) => void
  removeShape: (id: string) => void
  undo: () => void
  redo: () => void
  bringToFront: (id: string) => void
  sendToBack: (id: string) => void
  bringForward: (id: string) => void
  sendBackward: (id: string) => void
  resetZoom?: () => void
  onToggleShortcutsGuide?: () => void
  onToggleAI?: () => void
}

export function useKeyboardShortcuts(opts: UseKeyboardShortcutsOptions) {
  // Store mutable values in refs so the keydown listener always reads fresh state
  // without needing to re-register on every render.
  const stateRef = useRef(opts)

  useEffect(() => {
    stateRef.current = opts
  })

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip when user is typing in an input
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return
      }

      const s = stateRef.current
      const { shapes, selectedShapeIds, selectedShapeId } = s

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
      const modKey = isMac ? e.metaKey : e.ctrlKey
      const hasSelection = selectedShapeIds.size > 0

      // Undo (Ctrl/Cmd+Z)
      if (modKey && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault()
        s.undo()
        return
      }

      // Redo (Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y)
      if (modKey && ((e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y')) {
        e.preventDefault()
        s.redo()
        return
      }

      // Ctrl/Cmd+K — toggle AI command input
      if (modKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        s.onToggleAI?.()
        return
      }

      // Ctrl/Cmd+0 — reset zoom to 100%
      if (modKey && e.key === '0') {
        e.preventDefault()
        s.resetZoom?.()
        return
      }

      // Delete / Backspace — delete all selected shapes
      if ((e.key === 'Delete' || e.key === 'Backspace') && hasSelection) {
        e.preventDefault()
        for (const id of selectedShapeIds) {
          s.removeShape(id)
        }
        s.deselectAll()
        return
      }

      // Escape — deselect all and switch to select tool
      if (e.key === 'Escape') {
        e.preventDefault()
        s.deselectAll()
        s.setTool('select')
        return
      }

      // Ctrl+A — select all shapes
      if (modKey && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        s.selectAll(shapes)
        return
      }

      // Ctrl+D — duplicate selected shape(s) offset by 10px
      if (modKey && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        if (!hasSelection) return

        const newIds = new Set<string>()
        for (const id of selectedShapeIds) {
          const shape = shapes[id]
          if (!shape) continue
          const newShape: Shape = {
            ...shape,
            id: `shape-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            x: shape.x + 10,
            y: shape.y + 10,
            ...(shape.type === 'line' ? { x2: shape.x2 + 10, y2: shape.y2 + 10 } : {}),
          } as Shape
          s.addShape(newShape)
          newIds.add(newShape.id)
        }
        s.setSelectedShapeIds(newIds)
        return
      }

      // Layer ordering shortcuts (single-select only)
      if (modKey && e.key === ']' && selectedShapeId) {
        e.preventDefault()
        s.bringToFront(selectedShapeId)
        return
      }
      if (modKey && e.key === '[' && selectedShapeId) {
        e.preventDefault()
        s.sendToBack(selectedShapeId)
        return
      }
      if (e.key === ']' && selectedShapeId) {
        e.preventDefault()
        s.bringForward(selectedShapeId)
        return
      }
      if (e.key === '[' && selectedShapeId) {
        e.preventDefault()
        s.sendBackward(selectedShapeId)
        return
      }

      // ? — toggle keyboard shortcuts guide
      if (e.key === '?') {
        e.preventDefault()
        s.onToggleShortcutsGuide?.()
        return
      }

      // Arrow keys — nudge all selected shapes
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        if (!hasSelection) return
        e.preventDefault()
        const distance = e.shiftKey ? 10 : 1

        for (const id of selectedShapeIds) {
          const shape = shapes[id]
          if (!shape) continue

          let updates: Partial<Shape> = {}
          switch (e.key) {
            case 'ArrowUp':
              updates = { y: shape.y - distance }
              if (shape.type === 'line') updates = { ...updates, y2: shape.y2 - distance }
              break
            case 'ArrowDown':
              updates = { y: shape.y + distance }
              if (shape.type === 'line') updates = { ...updates, y2: shape.y2 + distance }
              break
            case 'ArrowLeft':
              updates = { x: shape.x - distance }
              if (shape.type === 'line') updates = { ...updates, x2: shape.x2 - distance }
              break
            case 'ArrowRight':
              updates = { x: shape.x + distance }
              if (shape.type === 'line') updates = { ...updates, x2: shape.x2 + distance }
              break
          }
          s.updateShape(id, updates)
        }
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
}
