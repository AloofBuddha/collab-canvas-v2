import { useCallback, useEffect, useRef, useState } from "react"
import { Doc } from "yjs"
import YPartyKitProvider from "y-partykit/provider"
import type { Awareness } from "y-protocols/awareness"
import type { Cursor, RemoteCursor } from "../types/index.ts"
import { getUserColorFromId } from "../utils/userColors.ts"
import { throttle, CURSOR_THROTTLE_MS } from "../utils/throttle.ts"

interface LocalAwarenessState {
  cursor: Cursor | null
  user: { name: string; color: string }
}

const ANIMAL_NAMES = [
  "Fox", "Owl", "Bear", "Wolf", "Deer", "Hawk", "Lynx", "Orca",
  "Puma", "Wren", "Ibis", "Kiwi", "Moth", "Newt", "Crow", "Dove",
]

function generateGuestName(clientId: number): string {
  const animal = ANIMAL_NAMES[clientId % ANIMAL_NAMES.length]
  return `${animal}-${clientId % 1000}`
}

export function useBoard(boardId: string) {
  const [remoteCursors, setRemoteCursors] = useState<RemoteCursor[]>([])
  const providerRef = useRef<YPartyKitProvider | null>(null)
  const awarenessRef = useRef<Awareness | null>(null)

  useEffect(() => {
    const doc = new Doc()
    const provider = new YPartyKitProvider("localhost:1999", boardId, doc, {
      protocol: "ws",
    })
    const awareness = provider.awareness

    providerRef.current = provider
    awarenessRef.current = awareness

    // Set local user identity
    const clientIdStr = String(awareness.clientID)
    const color = getUserColorFromId(clientIdStr)
    const name = generateGuestName(awareness.clientID)
    awareness.setLocalStateField("user", { name, color })

    // Listen for remote cursor changes
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
      provider.destroy()
      providerRef.current = null
      awarenessRef.current = null
    }
  }, [boardId])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const updateCursor = useCallback(
    throttle((cursor: Cursor) => {
      awarenessRef.current?.setLocalStateField("cursor", cursor)
    }, CURSOR_THROTTLE_MS),
    [boardId]
  )

  return { remoteCursors, updateCursor }
}
