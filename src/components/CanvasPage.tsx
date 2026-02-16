import { useParams } from "react-router-dom"
import { Stage, Layer } from "react-konva"
import type Konva from "konva"
import { useBoard } from "../hooks/useBoard.ts"
import RemoteCursor from "./RemoteCursor.tsx"

export function CanvasPage() {
  const { boardId } = useParams<{ boardId: string }>()
  const { remoteCursors, updateCursor } = useBoard(boardId!)

  const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage()
    const pointer = stage?.getPointerPosition()
    if (pointer) {
      updateCursor({ x: pointer.x, y: pointer.y })
    }
  }

  return (
    <Stage
      width={window.innerWidth}
      height={window.innerHeight}
      onMouseMove={handleMouseMove}
      style={{ background: "#fafafa" }}
    >
      <Layer>
        {remoteCursors.map((cursor) => (
          <RemoteCursor
            key={cursor.userId}
            cursor={cursor}
            stageScale={1}
          />
        ))}
      </Layer>
    </Stage>
  )
}
