/**
 * useShapeDragging Hook
 *
 * Manages shape dragging interactions.
 * Adapted from V1: removed Firebase sync, Zustand store reads.
 * In V2, updateShape writes to Yjs Y.Map which auto-syncs to all clients.
 *
 * Modes:
 *   - Single-shape drag: standard, moves only the dragged shape.
 *   - Multi-shape drag: when ≥2 shapes are selected and the user starts
 *     dragging any of them, the whole selection moves together. Positions
 *     are snapshotted at drag start so per-frame writes use
 *     `original + totalDelta` (avoids the closure-stale-state bug that
 *     causes followers to lag behind the lead shape).
 *   - Alt+Drag: clone the lead shape and drag the copy (the original
 *     stays put). Always single-shape; multi-clone is intentionally out
 *     of scope for now.
 */

import { useRef } from 'react'
import Konva from 'konva'
import type { Shape } from '../types'
import { getShapeWidth, getShapeHeight } from '../utils/shapeManipulation'

interface UseShapeDraggingProps {
  isPanning: boolean
  updateShape: (id: string, updates: Partial<Shape>) => void
  addShape: (shape: Shape) => void
  setSelectedShapeId: (id: string | null) => void
  selectedShapeIds: Set<string>
  shapes: Record<string, Shape>
}

interface MultiDragSnapshot {
  nodeStartX: number
  nodeStartY: number
  shapes: Array<{ id: string; x: number; y: number; x2?: number; y2?: number }>
}

export function useShapeDragging({
  isPanning,
  updateShape,
  addShape,
  setSelectedShapeId,
  selectedShapeIds,
  shapes,
}: UseShapeDraggingProps) {
  const altCloneIdRef = useRef<string | null>(null)
  const multiDragRef = useRef<MultiDragSnapshot | null>(null)

  const handleDragStart = (e: Konva.KonvaEventObject<DragEvent>, shape: Shape) => {
    altCloneIdRef.current = null
    multiDragRef.current = null

    if (isPanning || e.evt.button === 1) {
      e.target.stopDrag()
      return
    }

    // Alt+Drag: clone the lead shape and drag the copy.
    if (e.evt.altKey) {
      const cloneId = `shape-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
      const clone: Shape = {
        ...shape,
        id: cloneId,
        zIndex: Date.now(),
      }
      addShape(clone)
      altCloneIdRef.current = cloneId
      setSelectedShapeId(cloneId)
      return
    }

    // Multi-drag: if the dragged shape is part of a multi-selection, snapshot
    // every selected shape's position so we can move them together.
    if (selectedShapeIds.has(shape.id) && selectedShapeIds.size > 1) {
      const node = e.target
      multiDragRef.current = {
        nodeStartX: node.x(),
        nodeStartY: node.y(),
        shapes: Array.from(selectedShapeIds)
          .map(id => shapes[id])
          .filter((s): s is Shape => !!s)
          .map(s => ({
            id: s.id,
            x: s.x,
            y: s.y,
            x2: s.type === 'line' ? s.x2 : undefined,
            y2: s.type === 'line' ? s.y2 : undefined,
          })),
      }
    }
  }

  const handleDragMove = (e: Konva.KonvaEventObject<DragEvent>, shape: Shape) => {
    const node = e.target

    // Multi-drag path: move the whole snapshot by the lead shape's total delta.
    const multi = multiDragRef.current
    if (multi) {
      const totalDeltaX = node.x() - multi.nodeStartX
      const totalDeltaY = node.y() - multi.nodeStartY
      for (const orig of multi.shapes) {
        const updates: Partial<Shape> = {
          x: orig.x + totalDeltaX,
          y: orig.y + totalDeltaY,
        }
        if (orig.x2 !== undefined && orig.y2 !== undefined) {
          (updates as Record<string, number>).x2 = orig.x2 + totalDeltaX;
          (updates as Record<string, number>).y2 = orig.y2 + totalDeltaY
        }
        updateShape(orig.id, updates)
      }
      return
    }

    // Single-shape (or alt-clone) path: existing behavior.
    const targetId = altCloneIdRef.current || shape.id

    let updates: Partial<Shape>

    if (shape.type === 'line') {
      const oldCenterX = (shape.x + shape.x2) / 2
      const oldCenterY = (shape.y + shape.y2) / 2
      const deltaX = node.x() - oldCenterX
      const deltaY = node.y() - oldCenterY

      updates = {
        x: shape.x + deltaX,
        y: shape.y + deltaY,
        x2: shape.x2 + deltaX,
        y2: shape.y2 + deltaY,
      }
    } else {
      updates = {
        x: node.x() - getShapeWidth(shape) / 2,
        y: node.y() - getShapeHeight(shape) / 2,
      }
    }

    updateShape(targetId, updates)
  }

  const handleDragEnd = () => {
    altCloneIdRef.current = null
    multiDragRef.current = null
  }

  return { handleDragStart, handleDragMove, handleDragEnd }
}
