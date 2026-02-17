/**
 * GridBackground - Infinite grid rendered with Konva sceneFunc
 *
 * Ported from V1, simplified for React 19 compatibility.
 */

import { Layer, Shape } from 'react-konva'
import Konva from 'konva'
import { useMemo, useCallback } from 'react'

interface GridBackgroundProps {
  width: number
  height: number
  scale: number
  offsetX: number
  offsetY: number
}

const BUFFER_MULTIPLIER = 3

export default function GridBackground({ width, height, scale, offsetX, offsetY }: GridBackgroundProps) {
  const baseGridSize = 20
  const gridSize = scale < 0.5 ? baseGridSize * 2 : baseGridSize

  const visibleStartX = -offsetX / scale
  const visibleStartY = -offsetY / scale
  const visibleEndX = visibleStartX + width / scale
  const visibleEndY = visibleStartY + height / scale

  const renderBounds = useMemo(() => {
    const bufferWidth = (width / scale) * (BUFFER_MULTIPLIER - 1) / 2
    const bufferHeight = (height / scale) * (BUFFER_MULTIPLIER - 1) / 2

    return {
      startX: Math.floor((visibleStartX - bufferWidth) / gridSize) * gridSize,
      startY: Math.floor((visibleStartY - bufferHeight) / gridSize) * gridSize,
      endX: Math.ceil((visibleEndX + bufferWidth) / gridSize) * gridSize,
      endY: Math.ceil((visibleEndY + bufferHeight) / gridSize) * gridSize,
    }
  }, [visibleStartX, visibleStartY, visibleEndX, visibleEndY, width, height, scale, gridSize])

  const sceneFunc = useCallback((context: Konva.Context) => {
    const { startX, startY, endX, endY } = renderBounds

    for (let x = startX; x <= endX; x += gridSize) {
      const isMainLine = x % (gridSize * 5) === 0
      context.strokeStyle = isMainLine ? '#e0e0e0' : '#f0f0f0'
      context.lineWidth = isMainLine ? 1 / scale : 0.5 / scale
      context.beginPath()
      context.moveTo(x, startY)
      context.lineTo(x, endY)
      context.stroke()
    }

    for (let y = startY; y <= endY; y += gridSize) {
      const isMainLine = y % (gridSize * 5) === 0
      context.strokeStyle = isMainLine ? '#e0e0e0' : '#f0f0f0'
      context.lineWidth = isMainLine ? 1 / scale : 0.5 / scale
      context.beginPath()
      context.moveTo(startX, y)
      context.lineTo(endX, y)
      context.stroke()
    }
  }, [renderBounds, gridSize, scale])

  return (
    <Layer listening={false}>
      <Shape sceneFunc={sceneFunc} listening={false} />
    </Layer>
  )
}
