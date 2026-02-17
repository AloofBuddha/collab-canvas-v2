/**
 * useShapeDragging Hook
 *
 * Manages shape dragging interactions.
 * Adapted from V1: removed Firebase sync, Zustand store reads.
 * In V2, updateShape writes to Yjs Y.Map which auto-syncs to all clients.
 */

import Konva from 'konva'
import type { Shape } from '../types'
import { getShapeWidth, getShapeHeight } from '../utils/shapeManipulation'

interface UseShapeDraggingProps {
  isPanning: boolean
  updateShape: (id: string, updates: Partial<Shape>) => void
}

export function useShapeDragging({ isPanning, updateShape }: UseShapeDraggingProps) {
  const handleDragStart = (e: Konva.KonvaEventObject<DragEvent>) => {
    if (isPanning || e.evt.button === 1) {
      e.target.stopDrag()
    }
  }

  const handleDragMove = (e: Konva.KonvaEventObject<DragEvent>, shape: Shape) => {
    const node = e.target

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

    updateShape(shape.id, updates)
  }

  const handleDragEnd = () => {
    // In V2, Yjs already has the latest state from handleDragMove.
    // No separate persistence step needed.
  }

  return { handleDragStart, handleDragMove, handleDragEnd }
}
