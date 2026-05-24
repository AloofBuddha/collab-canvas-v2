/**
 * PenPreview — the in-progress path the user is sketching with the pen tool.
 * Renders the committed vertices as a solid polyline, plus a faint dashed
 * "rubber band" segment from the last vertex to the cursor, and small dots
 * on each committed vertex for spatial feedback.
 */

import { Group, Line, Circle } from 'react-konva'

interface PenPreviewProps {
  points: number[]
  previewPoint: { x: number; y: number } | null
  stageScale: number
  /** Show small dots on each committed vertex. True for the vertex-pen (path)
   *  tool where each click is a discrete decision; false for freehand
   *  strokes where the dots would be visual noise. */
  showDots?: boolean
}

export default function PenPreview({ points, previewPoint, stageScale, showDots = true }: PenPreviewProps) {
  if (points.length === 0) return null
  const lastX = points[points.length - 2]
  const lastY = points[points.length - 1]
  const dotR = 4 / stageScale
  const sw = 2 / stageScale

  return (
    <Group listening={false}>
      {points.length >= 4 && (
        <Line points={points} stroke="#1F2937" strokeWidth={sw} lineCap="round" lineJoin="round" />
      )}
      {previewPoint && (
        <Line
          points={[lastX, lastY, previewPoint.x, previewPoint.y]}
          stroke="#1F2937"
          strokeWidth={sw}
          dash={[6 / stageScale, 4 / stageScale]}
          opacity={0.45}
        />
      )}
      {showDots && Array.from({ length: points.length / 2 }).map((_, i) => (
        <Circle
          key={i}
          x={points[i * 2]}
          y={points[i * 2 + 1]}
          radius={dotR}
          fill="#fff"
          stroke="#1F2937"
          strokeWidth={sw}
        />
      ))}
    </Group>
  )
}
