/**
 * useMultiSelect Hook
 *
 * Manages multi-shape selection state:
 * - Click: single select
 * - Shift+Click: toggle shape in/out of selection
 * - Drag on empty canvas: draw selection box, select all shapes inside
 * - Ctrl/Cmd+A: select all shapes
 * - Escape: deselect all
 *
 * Ported from V1's useShapeSelection, simplified for V2 (no locking).
 */

import { useState, useRef, useCallback } from 'react'
import type { Shape } from '../types'
import { getShapeBounds } from '../utils/shapeFactory'

export interface SelectionBox {
  x: number
  y: number
  width: number
  height: number
}

interface UseMultiSelectReturn {
  selectedShapeIds: Set<string>
  /** Convenience: the single selected shape ID, or null if 0 or 2+ selected */
  selectedShapeId: string | null
  selectionBox: SelectionBox | null
  isSelecting: boolean

  /** Single click on a shape (handles shift+click toggle) */
  handleShapeClick: (shapeId: string, shiftKey: boolean) => void
  /** Click on empty canvas — deselect all */
  handleStageClick: () => void
  /** Select all shapes */
  selectAll: (shapes: Record<string, Shape>) => void
  /** Deselect all */
  deselectAll: () => void
  /** Programmatic single select (e.g. after creating a shape) */
  selectShape: (shapeId: string) => void

  /** Drag-to-select lifecycle */
  startSelection: (x: number, y: number) => void
  updateSelection: (x: number, y: number) => void
  finishSelection: (shapes: Record<string, Shape>) => void
  cancelSelection: () => void

  /** Replace the full selection set (e.g. from keyboard shortcuts) */
  setSelectedShapeIds: (ids: Set<string>) => void
}

export function useMultiSelect(): UseMultiSelectReturn {
  const [selectedShapeIds, setSelectedShapeIds] = useState<Set<string>>(new Set())
  const [isSelecting, setIsSelecting] = useState(false)
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null)
  const selectionStartPos = useRef<{ x: number; y: number } | null>(null)

  const selectedShapeId = selectedShapeIds.size === 1
    ? Array.from(selectedShapeIds)[0]
    : null

  const handleShapeClick = useCallback((shapeId: string, shiftKey: boolean) => {
    if (shiftKey) {
      setSelectedShapeIds(prev => {
        const next = new Set(prev)
        if (next.has(shapeId)) {
          next.delete(shapeId)
        } else {
          next.add(shapeId)
        }
        return next
      })
    } else {
      setSelectedShapeIds(new Set([shapeId]))
    }
  }, [])

  const handleStageClick = useCallback(() => {
    setSelectedShapeIds(new Set())
  }, [])

  const selectAll = useCallback((shapes: Record<string, Shape>) => {
    const ids = Object.keys(shapes)
    if (ids.length > 0) {
      setSelectedShapeIds(new Set(ids))
    }
  }, [])

  const deselectAll = useCallback(() => {
    setSelectedShapeIds(new Set())
  }, [])

  const selectShape = useCallback((shapeId: string) => {
    setSelectedShapeIds(new Set([shapeId]))
  }, [])

  // --- Drag-to-select ---

  const startSelection = useCallback((x: number, y: number) => {
    selectionStartPos.current = { x, y }
    setIsSelecting(true)
    setSelectionBox({ x, y, width: 0, height: 0 })
  }, [])

  const updateSelection = useCallback((x: number, y: number) => {
    if (!selectionStartPos.current) return
    const startX = selectionStartPos.current.x
    const startY = selectionStartPos.current.y
    setSelectionBox({
      x: Math.min(startX, x),
      y: Math.min(startY, y),
      width: Math.abs(x - startX),
      height: Math.abs(y - startY),
    })
  }, [])

  const finishSelection = useCallback((shapes: Record<string, Shape>) => {
    if (!selectionBox || !isSelecting) {
      setIsSelecting(false)
      setSelectionBox(null)
      selectionStartPos.current = null
      return
    }

    const selected = new Set<string>()
    for (const [id, shape] of Object.entries(shapes)) {
      if (doesShapeOverlap(shape, selectionBox)) {
        selected.add(id)
      }
    }

    if (selected.size > 0) {
      setSelectedShapeIds(selected)
    } else {
      setSelectedShapeIds(new Set())
    }

    setIsSelecting(false)
    setSelectionBox(null)
    selectionStartPos.current = null
  }, [selectionBox, isSelecting])

  const cancelSelection = useCallback(() => {
    setIsSelecting(false)
    setSelectionBox(null)
    selectionStartPos.current = null
  }, [])

  return {
    selectedShapeIds,
    selectedShapeId,
    selectionBox,
    isSelecting,
    handleShapeClick,
    handleStageClick,
    selectAll,
    deselectAll,
    selectShape,
    startSelection,
    updateSelection,
    finishSelection,
    cancelSelection,
    setSelectedShapeIds,
  }
}

/**
 * Check if a shape overlaps with the selection box (AABB collision).
 */
function doesShapeOverlap(shape: Shape, box: SelectionBox): boolean {
  const boxLeft = box.x
  const boxTop = box.y
  const boxRight = box.x + box.width
  const boxBottom = box.y + box.height

  // Use shapeFactory's getBounds for consistent bounding box calculation
  const bounds = getShapeBounds(shape)
  const shapeLeft = bounds.x
  const shapeTop = bounds.y
  const shapeRight = bounds.x + bounds.width
  const shapeBottom = bounds.y + bounds.height

  return !(
    shapeRight < boxLeft ||
    shapeLeft > boxRight ||
    shapeBottom < boxTop ||
    shapeTop > boxBottom
  )
}
