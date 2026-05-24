/**
 * usePenCreation Hook
 *
 * Pen-style creation for the path tool: each left-click anchors a new vertex,
 * a faint preview line follows the cursor from the last vertex, and
 * double-click (or Enter) finishes the path. Path stays open as a stroked
 * polyline. Polygon creation uses a separate drag-based flow because regular
 * N-gons are simpler to author by sizing a bounding box.
 *
 * The finished shape is normalized: minX/minY become (x, y), all vertices
 * become local-space coords, viewBox matches the bbox so subsequent resize
 * scales the path automatically.
 */

import { useCallback, useState } from 'react'
import type { PathShape, Shape } from '../types'

interface UsePenCreationProps {
  userId: string
  onShapeCreated: (shape: Shape) => void
  onToolChange: (tool: 'select') => void
}

export function usePenCreation({ userId, onShapeCreated, onToolChange }: UsePenCreationProps) {
  const [points, setPoints] = useState<number[]>([])
  const [previewPoint, setPreviewPoint] = useState<{ x: number; y: number } | null>(null)
  const isPenning = points.length > 0

  const addPoint = useCallback((x: number, y: number) => {
    setPoints(prev => [...prev, x, y])
  }, [])

  const updatePreview = useCallback((x: number, y: number) => {
    setPreviewPoint({ x, y })
  }, [])

  const reset = () => {
    setPoints([])
    setPreviewPoint(null)
  }

  const finishPen = useCallback(() => {
    if (points.length < 4) {
      reset()
      return
    }
    const xs: number[] = []
    const ys: number[] = []
    for (let i = 0; i < points.length; i += 2) {
      xs.push(points[i])
      ys.push(points[i + 1])
    }
    const minX = Math.min(...xs)
    const minY = Math.min(...ys)
    const maxX = Math.max(...xs)
    const maxY = Math.max(...ys)
    const width = Math.max(1, maxX - minX)
    const height = Math.max(1, maxY - minY)

    // Build the d string in local space (relative to minX, minY).
    let d = ''
    for (let i = 0; i < points.length; i += 2) {
      const lx = points[i] - minX
      const ly = points[i + 1] - minY
      d += i === 0 ? `M ${lx} ${ly}` : ` L ${lx} ${ly}`
    }

    const shape: PathShape = {
      id: crypto.randomUUID(),
      type: 'path',
      x: minX,
      y: minY,
      width,
      height,
      viewBoxWidth: width,
      viewBoxHeight: height,
      d,
      color: 'transparent',
      stroke: '#1F2937',
      strokeWidth: 2,
      opacity: 1,
      zIndex: Date.now(),
      createdBy: userId,
    }
    onShapeCreated(shape)
    onToolChange('select')
    reset()
  }, [points, userId, onShapeCreated, onToolChange])

  const cancelPen = useCallback(() => reset(), [])

  return { isPenning, points, previewPoint, addPoint, updatePreview, finishPen, cancelPen }
}
