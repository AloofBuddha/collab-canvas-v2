/**
 * useCanvasZoom Hook
 *
 * Manages canvas zoom (Ctrl+wheel) and vertical panning (regular wheel).
 * Ported from V1 — pure Konva, no sync deps.
 */

import Konva from 'konva'
import { MIN_ZOOM, MAX_ZOOM, ZOOM_SCALE_FACTOR } from '../utils/canvasConstants'

interface UseCanvasZoomProps {
  onScaleChange?: (scale: number) => void
}

export function useCanvasZoom({ onScaleChange }: UseCanvasZoomProps = {}) {
  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()

    const stage = e.target.getStage()
    if (!stage) return

    const evt = e.evt

    if (evt.ctrlKey) {
      const oldScale = stage.scaleX()
      const pointer = stage.getPointerPosition()
      if (!pointer) return

      const mousePointTo = {
        x: (pointer.x - stage.x()) / oldScale,
        y: (pointer.y - stage.y()) / oldScale,
      }

      const newScale = evt.deltaY < 0 ? oldScale * ZOOM_SCALE_FACTOR : oldScale / ZOOM_SCALE_FACTOR
      const limitedScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newScale))

      stage.scale({ x: limitedScale, y: limitedScale })
      stage.position({
        x: pointer.x - mousePointTo.x * limitedScale,
        y: pointer.y - mousePointTo.y * limitedScale,
      })

      onScaleChange?.(limitedScale)
    } else {
      const dy = evt.deltaY
      const oldPos = stage.position()
      stage.position({ x: oldPos.x, y: oldPos.y - dy })
    }
  }

  return { handleWheel }
}
