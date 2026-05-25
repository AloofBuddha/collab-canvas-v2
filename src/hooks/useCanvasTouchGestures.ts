/**
 * useCanvasTouchGestures Hook
 *
 * Two-finger pinch-to-zoom and pan for the canvas on touch devices.
 *
 * Single-finger touches are left to Konva's normal mouse-event emulation so
 * tap / drag continue to drive select, draw, and pen behavior. When a second
 * finger lands, Konva stops emulating mouse events for the duration of the
 * multi-touch gesture, so we drive zoom + pan ourselves off the raw
 * `e.evt.touches` list.
 *
 * Notes:
 * - The Stage container needs `touch-action: none` (set in CanvasPage) so the
 *   browser doesn't intercept the pinch as a page zoom.
 * - We mirror useCanvasZoom's clamp/anchor math: zoom is anchored at the
 *   midpoint between the two fingers and clamped to [MIN_ZOOM, MAX_ZOOM].
 * - Pan = movement of that midpoint between frames.
 */

import { useRef, useCallback } from 'react'
import Konva from 'konva'
import { MIN_ZOOM, MAX_ZOOM } from '../utils/canvasConstants'

interface Point {
  x: number
  y: number
}

interface UseCanvasTouchGesturesProps {
  onScaleChange?: (scale: number) => void
  onCancelInProgress?: () => void
}

function getDistance(p1: Point, p2: Point): number {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y)
}

function getCenter(p1: Point, p2: Point): Point {
  return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
}

export function useCanvasTouchGestures({
  onScaleChange,
  onCancelInProgress,
}: UseCanvasTouchGesturesProps = {}) {
  const lastDist = useRef(0)
  const lastCenter = useRef<Point | null>(null)
  const isPinching = useRef(false)

  const handleTouchMove = useCallback((e: Konva.KonvaEventObject<TouchEvent>) => {
    const evt = e.evt
    const touches = evt.touches
    if (touches.length < 2) return

    evt.preventDefault()

    const stage = e.target.getStage()
    if (!stage) return

    // First frame of a multi-touch gesture: cancel any in-progress single-touch
    // operation (drag-select, freehand stroke, etc.) so the two-finger gesture
    // doesn't leave a half-finished shape behind.
    if (!isPinching.current) {
      isPinching.current = true
      onCancelInProgress?.()
    }

    const t1 = touches[0]
    const t2 = touches[1]
    const p1 = { x: t1.clientX, y: t1.clientY }
    const p2 = { x: t2.clientX, y: t2.clientY }

    const center = getCenter(p1, p2)
    const dist = getDistance(p1, p2)

    // Skip the first frame — we need a baseline to diff against.
    if (!lastCenter.current || lastDist.current === 0) {
      lastCenter.current = center
      lastDist.current = dist
      return
    }

    const oldScale = stage.scaleX()
    const rect = stage.container().getBoundingClientRect()

    // Translate the gesture center from page coords into stage-local coords,
    // then into the unscaled "world" point that should stay under the fingers.
    const stagePoint = { x: center.x - rect.left, y: center.y - rect.top }
    const worldPoint = {
      x: (stagePoint.x - stage.x()) / oldScale,
      y: (stagePoint.y - stage.y()) / oldScale,
    }

    const rawScale = oldScale * (dist / lastDist.current)
    const newScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, rawScale))

    // Translation delta = how far the midpoint moved this frame, in page coords.
    const dx = center.x - lastCenter.current.x
    const dy = center.y - lastCenter.current.y

    stage.scale({ x: newScale, y: newScale })
    stage.position({
      x: stagePoint.x - worldPoint.x * newScale + dx,
      y: stagePoint.y - worldPoint.y * newScale + dy,
    })

    lastDist.current = dist
    lastCenter.current = center
    onScaleChange?.(newScale)
  }, [onScaleChange, onCancelInProgress])

  const handleTouchEnd = useCallback((e: Konva.KonvaEventObject<TouchEvent>) => {
    // Reset only when we drop below two active touches. Going from 3→2 fingers
    // shouldn't restart the baseline mid-gesture.
    if (e.evt.touches.length < 2) {
      lastDist.current = 0
      lastCenter.current = null
      isPinching.current = false
    }
  }, [])

  return { handleTouchMove, handleTouchEnd, isPinchingRef: isPinching }
}
