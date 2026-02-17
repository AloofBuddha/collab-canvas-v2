/**
 * Global Keyboard Shortcuts Hook
 *
 * Handles keyboard shortcuts for the canvas:
 * - Delete/Backspace: Delete selected shape
 * - Ctrl/Cmd+D: Duplicate selected shape (offset by 10px)
 * - Arrow keys: Nudge selected shape by 1px (10px with Shift)
 * - Escape: Deselect and switch to select tool
 * - Ctrl/Cmd+A: Select all (prevent default — multi-select comes later)
 * - ] : Bring selected shape to front (highest zIndex)
 * - [ : Send selected shape to back (lowest zIndex)
 * - Ctrl/Cmd+] : Bring selected shape forward one step
 * - Ctrl/Cmd+[ : Send selected shape backward one step
 *
 * V2 approach: operates directly on Yjs via useBoard callbacks (addShape,
 * updateShape, removeShape). No local stores or Firebase persistence needed.
 */

import { useEffect, useRef } from 'react'
import type { Shape, Tool } from '../types'

interface UseKeyboardShortcutsOptions {
  shapes: Record<string, Shape>
  selectedShapeId: string | null
  setSelectedShapeId: (id: string | null) => void
  setTool: (tool: Tool) => void
  addShape: (shape: Shape) => void
  updateShape: (id: string, updates: Partial<Shape>) => void
  removeShape: (id: string) => void
  bringToFront: (id: string) => void
  sendToBack: (id: string) => void
  bringForward: (id: string) => void
  sendBackward: (id: string) => void
}

export function useKeyboardShortcuts({
  shapes,
  selectedShapeId,
  setSelectedShapeId,
  setTool,
  addShape,
  updateShape,
  removeShape,
  bringToFront,
  sendToBack,
  bringForward,
  sendBackward,
}: UseKeyboardShortcutsOptions) {
  // Store mutable values in refs so the keydown listener always reads fresh state
  // without needing to re-register on every render.
  const stateRef = useRef({
    shapes,
    selectedShapeId,
    setSelectedShapeId,
    setTool,
    addShape,
    updateShape,
    removeShape,
    bringToFront,
    sendToBack,
  })

  useEffect(() => {
    stateRef.current = {
      shapes,
      selectedShapeId,
      setSelectedShapeId,
      setTool,
      addShape,
      updateShape,
      removeShape,
      bringToFront,
      sendToBack,
    }
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

      const {
        shapes,
        selectedShapeId,
        setSelectedShapeId,
        setTool,
        addShape,
        updateShape,
        removeShape,
        bringToFront,
        sendToBack,
      } = stateRef.current

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
      const modKey = isMac ? e.metaKey : e.ctrlKey

      // Delete / Backspace — delete selected shape
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedShapeId) {
        e.preventDefault()
        removeShape(selectedShapeId)
        setSelectedShapeId(null)
        return
      }

      // Escape — deselect and switch to select tool
      if (e.key === 'Escape') {
        e.preventDefault()
        setSelectedShapeId(null)
        setTool('select')
        return
      }

      // Ctrl+A — select all (placeholder until multi-select is implemented)
      if (modKey && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        return
      }

      // Ctrl+D — duplicate selected shape offset by 10px
      if (modKey && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        if (!selectedShapeId) return
        const shape = shapes[selectedShapeId]
        if (!shape) return

        const newShape: Shape = {
          ...shape,
          id: `shape-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          x: shape.x + 10,
          y: shape.y + 10,
          // For lines, also offset the end point
          ...(shape.type === 'line' ? { x2: shape.x2 + 10, y2: shape.y2 + 10 } : {}),
        } as Shape
        addShape(newShape)
        setSelectedShapeId(newShape.id)
        return
      }

      // Ctrl+] — bring selected shape to front (all the way)
      if (modKey && e.key === ']' && selectedShapeId) {
        e.preventDefault()
        bringToFront(selectedShapeId)
        return
      }

      // Ctrl+[ — send selected shape to back (all the way)
      if (modKey && e.key === '[' && selectedShapeId) {
        e.preventDefault()
        sendToBack(selectedShapeId)
        return
      }

      // ] — bring selected shape forward one step
      if (e.key === ']' && selectedShapeId) {
        e.preventDefault()
        bringForward(selectedShapeId)
        return
      }

      // [ — send selected shape backward one step
      if (e.key === '[' && selectedShapeId) {
        e.preventDefault()
        sendBackward(selectedShapeId)
        return
      }

      // Arrow keys — nudge selected shape
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        if (!selectedShapeId) return
        const shape = shapes[selectedShapeId]
        if (!shape) return

        e.preventDefault()
        const distance = e.shiftKey ? 10 : 1
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

        updateShape(selectedShapeId, updates)
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: reads from stateRef, not deps
  }, [])
}
