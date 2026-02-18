/**
 * useShapeDragging Hook
 *
 * Manages shape dragging interactions.
 * Adapted from V1: removed Firebase sync, Zustand store reads.
 * In V2, updateShape writes to Yjs Y.Map which auto-syncs to all clients.
 *
 * Alt+Drag: Duplicate the shape and drag the copy (original stays in place).
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
}

export function useShapeDragging({ isPanning, updateShape, addShape, setSelectedShapeId }: UseShapeDraggingProps) {
  // Track the alt-drag clone so handleDragMove operates on it
  const altCloneIdRef = useRef<string | null>(null)

  const handleDragStart = (e: Konva.KonvaEventObject<DragEvent>, shape: Shape) => {
    altCloneIdRef.current = null

    if (isPanning || e.evt.button === 1) {
      e.target.stopDrag()
      return
    }

    // Alt+Drag: create a clone, select it, and let the drag continue on it
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
    }
  }

  const handleDragMove = (e: Konva.KonvaEventObject<DragEvent>, shape: Shape) => {
    const node = e.target
    // If alt-cloning, apply movement to the clone, not the original
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
  }

  return { handleDragStart, handleDragMove, handleDragEnd }
}
