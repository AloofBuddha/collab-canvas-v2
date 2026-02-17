/**
 * useCanvasPanning Hook
 *
 * Manages canvas panning state and document-level mouse listeners
 * for smooth panning even when cursor leaves the window.
 * Ported from V1 — pure Konva, no sync deps.
 */

import { useState, useEffect, type RefObject } from 'react'
import Konva from 'konva'

interface UseCanvasPanningProps {
  stageRef: RefObject<Konva.Stage | null>
}

export function useCanvasPanning({ stageRef }: UseCanvasPanningProps) {
  const [isPanning, setIsPanning] = useState(false)

  useEffect(() => {
    const handleDocumentMouseUp = () => {
      if (isPanning) setIsPanning(false)
    }

    const handleDocumentMouseMove = (e: MouseEvent) => {
      if (isPanning && stageRef.current) {
        const stage = stageRef.current
        const oldPos = stage.position()
        stage.position({
          x: oldPos.x + e.movementX,
          y: oldPos.y + e.movementY,
        })
      }
    }

    if (isPanning) {
      document.addEventListener('mouseup', handleDocumentMouseUp)
      document.addEventListener('mousemove', handleDocumentMouseMove)
    }

    return () => {
      document.removeEventListener('mouseup', handleDocumentMouseUp)
      document.removeEventListener('mousemove', handleDocumentMouseMove)
    }
  }, [isPanning, stageRef])

  return { isPanning, setIsPanning }
}
