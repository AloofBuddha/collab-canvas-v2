import { useEffect, useMemo, useState } from "react"
import { Doc } from "yjs"
import YPartyKitProvider from "y-partykit/provider"
import { Awareness } from "y-protocols/awareness"
import type { Cursor, RemoteCursor } from "../types/index.ts"

interface LocalAwarenessState {
  cursor: Cursor | null
  user: { name: string; color: string }
}

export function useBoard(boardId: string) {
  const { provider, awareness } = useMemo(() => {
    const doc = new Doc()
    const provider = new YPartyKitProvider("localhost:1999", boardId, doc, {
      protocol: "ws",
    })
    return { provider, awareness: provider.awareness as Awareness }
  }, [boardId])

  const [remoteCursors, setRemoteCursors] = useState<RemoteCursor[]>([])

  useEffect(() => {
    const handleChange = () => {
      const states = awareness.getStates() as Map<number, LocalAwarenessState>
      const cursors: RemoteCursor[] = []

      states.forEach((state, clientId) => {
        if (clientId === awareness.clientID) return
        if (!state.cursor) return

        cursors.push({
          x: state.cursor.x,
          y: state.cursor.y,
          userId: String(clientId),
          color: state.user?.color ?? "#888",
          name: state.user?.name ?? "Anonymous",
        })
      })

      setRemoteCursors(cursors)
    }

    awareness.on("change", handleChange)
    return () => {
      awareness.off("change", handleChange)
    }
  }, [awareness])

  useEffect(() => {
    // Set initial user info on awareness
    const colors = ["#e74c3c", "#3498db", "#2ecc71", "#f39c12", "#9b59b6", "#1abc9c"]
    const color = colors[Math.floor(Math.random() * colors.length)]
    awareness.setLocalStateField("user", {
      name: `User-${awareness.clientID}`,
      color,
    })

    return () => {
      provider.destroy()
    }
  }, [awareness, provider])

  const updateCursor = (cursor: Cursor) => {
    awareness.setLocalStateField("cursor", cursor)
  }

  return { remoteCursors, updateCursor }
}
