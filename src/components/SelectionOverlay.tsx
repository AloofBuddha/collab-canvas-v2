/**
 * SelectionOverlay — Renders the drag-to-select rectangle and the
 * bounding box around multiple selected shapes.
 *
 * - DragSelectRect: blue dashed rectangle shown during drag-select
 * - MultiSelectBounds: blue dashed bounding box around all selected shapes,
 *   with a draggable hit region for group movement
 */

import { Rect, Group } from 'react-konva'
import Konva from 'konva'
import type { Shape } from '../types'
import type { SelectionBox } from '../hooks/useMultiSelect'
import { getShapeBounds } from '../utils/shapeFactory'
import { SELECTION_COLOR } from '../utils/canvasConstants'

// --- Drag-to-select rectangle ---

interface DragSelectRectProps {
  box: SelectionBox
  stageScale: number
}

export function DragSelectRect({ box, stageScale }: DragSelectRectProps) {
  return (
    <Rect
      x={box.x}
      y={box.y}
      width={box.width}
      height={box.height}
      fill="rgba(59, 130, 246, 0.08)"
      stroke={SELECTION_COLOR}
      strokeWidth={1 / stageScale}
      dash={[6 / stageScale, 4 / stageScale]}
      listening={false}
    />
  )
}

// --- Bounding box around multiple selected shapes ---

interface MultiSelectBoundsProps {
  shapes: Shape[]
  stageScale: number
  onGroupDragStart: (e: Konva.KonvaEventObject<DragEvent>) => void
  onGroupDragMove: (e: Konva.KonvaEventObject<DragEvent>) => void
  onGroupDragEnd: () => void
}

export function MultiSelectBounds({
  shapes,
  stageScale,
  onGroupDragStart,
  onGroupDragMove,
  onGroupDragEnd,
}: MultiSelectBoundsProps) {
  if (shapes.length < 2) return null

  const bounds = calculateGroupBounds(shapes)
  const padding = 12 / stageScale
  const boxX = bounds.minX - padding
  const boxY = bounds.minY - padding
  const boxWidth = bounds.maxX - bounds.minX + padding * 2
  const boxHeight = bounds.maxY - bounds.minY + padding * 2

  return (
    <Group
      x={boxX}
      y={boxY}
      draggable
      onDragStart={(e) => {
        e.cancelBubble = true
        onGroupDragStart(e)
      }}
      onDragMove={onGroupDragMove}
      onDragEnd={(e) => {
        e.cancelBubble = true
        onGroupDragEnd()
      }}
      onMouseEnter={(e) => {
        const container = e.target.getStage()?.container()
        if (container) container.style.cursor = 'move'
      }}
      onMouseLeave={(e) => {
        const container = e.target.getStage()?.container()
        if (container) container.style.cursor = 'default'
      }}
    >
      {/* Invisible hitbox for dragging */}
      <Rect
        x={0}
        y={0}
        width={boxWidth}
        height={boxHeight}
        fill="transparent"
        listening={true}
      />
      {/* Visual dashed border */}
      <Rect
        x={0}
        y={0}
        width={boxWidth}
        height={boxHeight}
        stroke={SELECTION_COLOR}
        strokeWidth={2 / stageScale}
        dash={[6 / stageScale, 4 / stageScale]}
        listening={false}
      />
    </Group>
  )
}

function calculateGroupBounds(shapes: Shape[]): {
  minX: number; minY: number; maxX: number; maxY: number
} {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const shape of shapes) {
    const b = getShapeBounds(shape)
    minX = Math.min(minX, b.x)
    minY = Math.min(minY, b.y)
    maxX = Math.max(maxX, b.x + b.width)
    maxY = Math.max(maxY, b.y + b.height)
  }

  return { minX, minY, maxX, maxY }
}
