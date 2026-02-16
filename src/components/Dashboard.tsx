import { useNavigate } from "react-router-dom"

export function Dashboard() {
  const navigate = useNavigate()

  const createBoard = () => {
    const boardId = crypto.randomUUID().slice(0, 8)
    navigate(`/board/${boardId}`)
  }

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
      <button onClick={createBoard} style={{ padding: "12px 24px", fontSize: "18px", cursor: "pointer" }}>
        New Board
      </button>
    </div>
  )
}
