/**
 * usePenStrokeCreation Hook
 *
 * Freehand drawing for the "pen" tool: mousedown begins a stroke, mousemove
 * samples points along the cursor's path, mouseup finalizes the stroke as
 * an open path shape (a stroked polyline made of all the sampled vertices).
 *
 * The sample step is in world-space pixels, throttled so we don't capture
 * one vertex per mousemove event (which can be 100+ per second).
 */

import { useCallback, useRef, useState } from 'react'
import type { PathShape, Shape } from '../types'

const SAMPLE_STEP_PX = 4 // world-space distance between captured vertices

interface UsePenStrokeCreationProps {
  userId: string
  onShapeCreated: (shape: Shape) => void
  onToolChange: (tool: 'select') => void
}

export function usePenStrokeCreation({
  userId, onShapeCreated, onToolChange,
}: UsePenStrokeCreationProps) {
  const [points, setPoints] = useState<number[]>([])
  const isStroking = points.length > 0
  const lastSampleRef = useRef<{ x: number; y: number } | null>(null)

  const startStroke = useCallback((x: number, y: number) => {
    lastSampleRef.current = { x, y }
    setPoints([x, y])
  }, [])

  const addStrokeSample = useCallback((x: number, y: number) => {
    const last = lastSampleRef.current
    if (!last) return
    const dx = x - last.x
    const dy = y - last.y
    if (dx * dx + dy * dy < SAMPLE_STEP_PX * SAMPLE_STEP_PX) return
    lastSampleRef.current = { x, y }
    setPoints(prev => [...prev, x, y])
  }, [])

  const reset = () => {
    setPoints([])
    lastSampleRef.current = null
  }

  const finishStroke = useCallback(() => {
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

  const cancelStroke = useCallback(() => reset(), [])

  return {
    isStroking,
    points,
    startStroke,
    addStrokeSample,
    finishStroke,
    cancelStroke,
  }
}
