/**
 * useShapeCreation Hook
 *
 * Manages the creation of new shapes via click-and-drag.
 * Ported from V1 — pure callback-based, no sync deps.
 */

import { useState } from 'react'
import Konva from 'konva'
import type { Shape, ShapeType } from '../types'
import { createShape, updateShapeCreation, hasShapeMinimumSize, normalizeShape } from '../utils/shapeFactory'
import { MIN_SHAPE_SIZE } from '../utils/canvasConstants'

interface UseShapeCreationProps {
  userId: string
  onShapeCreated: (shape: Shape) => void
  onToolChange: (tool: 'select') => void
  shapeType: ShapeType
}

export function useShapeCreation({
  userId,
  onShapeCreated,
  onToolChange,
  shapeType,
}: UseShapeCreationProps) {
  const [isDrawing, setIsDrawing] = useState(false)
  const [newShape, setNewShape] = useState<Shape | null>(null)

  const startCreating = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage()
    if (!stage) return

    const pos = stage.getRelativePointerPosition()
    if (!pos) return

    const shape = createShape(shapeType, pos.x, pos.y, userId)
    setNewShape(shape)
    setIsDrawing(true)
  }

  const updateSize = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!isDrawing || !newShape) return

    const stage = e.target.getStage()
    if (!stage) return

    const pos = stage.getRelativePointerPosition()
    if (!pos) return

    setNewShape(updateShapeCreation(newShape, pos.x, pos.y))
  }

  const finishCreating = () => {
    if (isDrawing && newShape) {
      if (hasShapeMinimumSize(newShape, MIN_SHAPE_SIZE)) {
        onShapeCreated(normalizeShape(newShape))
        onToolChange('select')
      }
      setNewShape(null)
      setIsDrawing(false)
    }
  }

  const cancelCreating = () => {
    setNewShape(null)
    setIsDrawing(false)
  }

  return { isDrawing, newShape, startCreating, updateSize, finishCreating, cancelCreating }
}
