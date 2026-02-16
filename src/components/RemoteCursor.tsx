import { Group, Path, Rect, Text } from 'react-konva'
import type { RemoteCursor as RemoteCursorType } from '../types/index.ts'

interface RemoteCursorProps {
  cursor: RemoteCursorType
  stageScale: number
}

const CURSOR_ARROW_PATH = "M 0 0 L 0 16 L 4 12 L 7 18 L 9 17 L 6 11 L 11 11 Z"

/**
 * RemoteCursor Component
 *
 * Renders a remote user's cursor as a Konva Group with:
 * - Arrow shape (Path)
 * - Name label background (Rect)
 * - Name label text (Text)
 *
 * This component is rendered inside a Konva Layer so it properly
 * pans with the canvas. It applies inverse scaling to maintain
 * constant size regardless of zoom level.
 */
export default function RemoteCursor({ cursor, stageScale }: RemoteCursorProps) {
  // Apply inverse scaling to keep cursor constant size
  const inverseScale = 1 / stageScale

  return (
    <Group
      x={cursor.x}
      y={cursor.y}
      scaleX={inverseScale}
      scaleY={inverseScale}
    >
      {/* Cursor arrow shape */}
      <Path
        data={CURSOR_ARROW_PATH}
        fill={cursor.color}
        stroke="white"
        strokeWidth={1}
        shadowColor="black"
        shadowBlur={4}
        shadowOpacity={0.3}
      />

      {/* Name label background */}
      <Rect
        x={12}
        y={5}
        width={cursor.name.length * 7 + 12}
        height={20}
        fill={cursor.color}
        cornerRadius={4}
      />

      {/* Name label text */}
      <Text
        x={18}
        y={9}
        text={cursor.name}
        fontSize={12}
        fill="white"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontStyle="500"
      />
    </Group>
  )
}
