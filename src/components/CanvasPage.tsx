import { useParams } from "react-router-dom"
import { useBoard } from "../hooks/useBoard.ts"

export function CanvasPage() {
  const { boardId } = useParams<{ boardId: string }>()
  const { remoteCursors, updateCursor } = useBoard(boardId!)

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    updateCursor({ x: e.clientX, y: e.clientY })
  }

  return (
    <div
      onMouseMove={handleMouseMove}
      style={{ position: "relative", width: "100vw", height: "100vh", overflow: "hidden", background: "#fafafa" }}
    >
      <div style={{ position: "absolute", top: 12, left: 12, fontSize: 14, color: "#888" }}>
        Board: {boardId}
      </div>

      {remoteCursors.map((cursor) => (
        <div
          key={cursor.userId}
          style={{
            position: "absolute",
            left: cursor.x,
            top: cursor.y,
            pointerEvents: "none",
            transform: "translate(-2px, -2px)",
          }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill={cursor.color}>
            <path d="M0 0 L0 16 L4.5 12 L8 20 L10.5 19 L7 11 L13 11 Z" />
          </svg>
          <span
            style={{
              position: "absolute",
              left: 16,
              top: 14,
              fontSize: 11,
              background: cursor.color,
              color: "white",
              padding: "1px 5px",
              borderRadius: 3,
              whiteSpace: "nowrap",
            }}
          >
            {cursor.name}
          </span>
        </div>
      ))}
    </div>
  )
}
