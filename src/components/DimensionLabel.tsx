/**
 * DimensionLabel — Shows "width × height" below selected shapes
 *
 * Rendered outside the shape's Group (not subject to shape rotation).
 * Positioned below the shape's rotated bounding box, centered horizontally.
 * Font size scales inversely with zoom so it stays constant in screen space.
 *
 * Ported from V1's ShapeDimensionLabel.tsx, simplified for V2.
 */

import { Text as KonvaText } from 'react-konva'
import type { Shape, LineShape } from '../types'
import { getShapeWidth, getShapeHeight } from '../utils/shapeManipulation'

const LABEL_FONT_SIZE = 14
const LABEL_PADDING = 8

function formatDimensions(shape: Shape): string {
  if (shape.type === 'line') {
    const line = shape as LineShape
    const length = Math.sqrt(
      Math.pow(line.x2 - line.x, 2) + Math.pow(line.y2 - line.y, 2),
    )
    return `${Math.round(length)}px`
  }
  const w = Math.round(getShapeWidth(shape))
  const h = Math.round(getShapeHeight(shape))
  return `${w} × ${h}`
}

interface DimensionLabelProps {
  shape: Shape
  stageScale: number
}

export default function DimensionLabel({ shape, stageScale }: DimensionLabelProps) {
  const { rotation = 0 } = shape
  const text = formatDimensions(shape)
  const fontSize = LABEL_FONT_SIZE / stageScale
  const padding = LABEL_PADDING / stageScale

  let labelX: number
  let labelY: number

  if (shape.type === 'line') {
    const line = shape as LineShape
    labelX = (line.x + line.x2) / 2
    labelY = Math.max(line.y, line.y2)
  } else {
    const w = getShapeWidth(shape)
    const h = getShapeHeight(shape)
    const centerX = shape.x + w / 2
    const centerY = shape.y + h / 2

    if (rotation === 0) {
      // Fast path: no rotation math needed
      labelX = centerX
      labelY = shape.y + h
    } else {
      // Find the bottom-most point of the rotated bounding box
      const radians = (rotation * Math.PI) / 180
      const corners = [
        { x: shape.x, y: shape.y },
        { x: shape.x + w, y: shape.y },
        { x: shape.x, y: shape.y + h },
        { x: shape.x + w, y: shape.y + h },
      ]
      const rotatedYs = corners.map((c) => {
        const dx = c.x - centerX
        const dy = c.y - centerY
        return centerY + dx * Math.sin(radians) + dy * Math.cos(radians)
      })
      labelX = centerX
      labelY = Math.max(...rotatedYs)
    }
  }

  // Approximate text width for centering (monospace-ish estimate)
  const approxWidth = text.length * fontSize * 0.6

  return (
    <KonvaText
      x={labelX - approxWidth / 2}
      y={labelY + padding}
      text={text}
      fontSize={fontSize}
      fontFamily="Inter, system-ui, sans-serif"
      fill="#555555"
      listening={false}
    />
  )
}
