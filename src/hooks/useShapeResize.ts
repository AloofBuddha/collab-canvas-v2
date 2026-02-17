/**
 * useShapeResize Hook
 *
 * Manages shape resize interactions via corner/edge handles.
 * Uses the existing detectManipulationZone and calculateResize utilities
 * ported from V1's useShapeManipulation.ts.
 *
 * Flow:
 * 1. On mousedown over a selected shape, detect which zone was hit
 * 2. If it's a corner/edge/endpoint, enter resize mode
 * 3. On mousemove, calculate new dimensions and update shape via Yjs
 * 4. On mouseup, finalize
 */

import { useRef, useCallback } from 'react'
import type { Shape } from '../types'
import type { ManipulationZone } from '../utils/shapeManipulation'
import {
  detectManipulationZone,
  calculateResize,
  getPointerPosition,
} from '../utils/shapeManipulation'
import Konva from 'konva'

interface UseShapeResizeProps {
  shapes: Record<string, Shape>
  updateShape: (id: string, updates: Partial<Shape>) => void
  stageScale: number
}

interface ResizeState {
  shapeId: string
  zone: ManipulationZone
  originalShape: Shape
  startMouseX: number
  startMouseY: number
}

export function useShapeResize({ shapes, updateShape, stageScale }: UseShapeResizeProps) {
  const resizeStateRef = useRef<ResizeState | null>(null)

  /**
   * Try to start a resize operation. Returns true if resize started
   * (i.e., user clicked on a resize handle), false if it was a center click.
   */
  const tryStartResize = useCallback((
    stage: Konva.Stage,
    shapeId: string,
  ): boolean => {
    const shape = shapes[shapeId]
    if (!shape) return false

    const pos = getPointerPosition(stage)
    if (!pos) return false

    const hit = detectManipulationZone(shape, pos.x, pos.y, stageScale)

    // Only intercept corner, edge, and line endpoint zones
    if (hit.zone === 'center') return false
    if (hit.zone.includes('rotate')) return false // Skip rotation for now

    resizeStateRef.current = {
      shapeId,
      zone: hit.zone,
      originalShape: { ...shape },
      startMouseX: pos.x,
      startMouseY: pos.y,
    }

    return true
  }, [shapes, stageScale])

  const handleResizeMove = useCallback((stage: Konva.Stage) => {
    const state = resizeStateRef.current
    if (!state) return

    const pos = getPointerPosition(stage)
    if (!pos) return

    const currentShape = shapes[state.shapeId]
    if (!currentShape) return

    const updates = calculateResize(
      currentShape,
      state.zone,
      pos.x,
      pos.y,
      state.startMouseX,
      state.startMouseY,
      state.originalShape,
    )

    if (Object.keys(updates).length > 0) {
      updateShape(state.shapeId, updates)
    }
  }, [shapes, updateShape])

  const handleResizeEnd = useCallback(() => {
    resizeStateRef.current = null
  }, [])

  const isResizing = useCallback(() => {
    return resizeStateRef.current !== null
  }, [])

  /**
   * Get the cursor for the current mouse position over a shape.
   * Returns null if not hovering over a handle.
   */
  const getHandleCursor = useCallback((
    stage: Konva.Stage,
    shapeId: string,
  ): string | null => {
    const shape = shapes[shapeId]
    if (!shape) return null

    const pos = getPointerPosition(stage)
    if (!pos) return null

    const hit = detectManipulationZone(shape, pos.x, pos.y, stageScale)
    if (hit.zone === 'center') return null
    if (hit.zone.includes('rotate')) return null

    return hit.cursor
  }, [shapes, stageScale])

  return {
    tryStartResize,
    handleResizeMove,
    handleResizeEnd,
    isResizing,
    getHandleCursor,
  }
}
