import { useCallback, useEffect, useRef, useState } from "react"
import { Doc, Map as YMap } from "yjs"
import YPartyKitProvider from "y-partykit/provider"
import type { Awareness } from "y-protocols/awareness"
import type { Cursor, RemoteCursor, Shape, User } from "../types/index.ts"
import { getUserColorFromId } from "../utils/userColors.ts"
import { throttle, CURSOR_THROTTLE_MS } from "../utils/throttle.ts"

interface LocalAwarenessState {
  cursor: Cursor | null
  user: { id: string; name: string; color: string }
}

const ANIMAL_NAMES = [
  "Fox", "Owl", "Bear", "Wolf", "Deer", "Hawk", "Lynx", "Orca",
  "Puma", "Wren", "Ibis", "Kiwi", "Moth", "Newt", "Crow", "Dove",
]

function generateGuestName(clientId: number): string {
  const animal = ANIMAL_NAMES[clientId % ANIMAL_NAMES.length]
  return `${animal}-${clientId % 1000}`
}

const PARTYKIT_HOST = import.meta.env.VITE_PARTYKIT_HOST ?? "localhost:1999"
const WS_PROTOCOL = import.meta.env.PROD ? "wss" : "ws"

export function useBoard(boardId: string, user?: User) {
  const [remoteCursors, setRemoteCursors] = useState<RemoteCursor[]>([])
  const [shapes, setShapes] = useState<Record<string, Shape>>({})
  const [onlineUsers, setOnlineUsers] = useState<User[]>([])
  const providerRef = useRef<YPartyKitProvider | null>(null)
  const awarenessRef = useRef<Awareness | null>(null)
  const shapesMapRef = useRef<YMap<Shape> | null>(null)

  useEffect(() => {
    const doc = new Doc()
    const provider = new YPartyKitProvider(PARTYKIT_HOST, boardId, doc, {
      protocol: WS_PROTOCOL as "ws" | "wss",
    })
    const awareness = provider.awareness
    const shapesMap = doc.getMap<Shape>("shapes")

    providerRef.current = provider
    awarenessRef.current = awareness
    shapesMapRef.current = shapesMap

    // Set local user identity
    const clientIdStr = String(awareness.clientID)
    const id = user?.userId ?? clientIdStr
    const color = user?.color ?? getUserColorFromId(clientIdStr)
    const name = user?.displayName ?? generateGuestName(awareness.clientID)
    awareness.setLocalStateField("user", { id, name, color })

    // Sync shapes from Y.Map → React state
    const syncShapes = () => {
      const newShapes: Record<string, Shape> = {}
      shapesMap.forEach((value, key) => {
        newShapes[key] = value
      })
      setShapes(newShapes)
    }

    shapesMap.observeDeep(syncShapes)
    // Initial sync
    syncShapes()

    // Listen for awareness changes (cursors + online users)
    const handleAwarenessChange = () => {
      const states = awareness.getStates() as Map<number, LocalAwarenessState>
      const cursors: RemoteCursor[] = []
      const users: User[] = []

      states.forEach((state, clientId) => {
        if (state.user) {
          users.push({
            userId: state.user.id ?? String(clientId),
            displayName: state.user.name,
            color: state.user.color,
          })
        }

        if (clientId === awareness.clientID) return
        if (!state.cursor) return

        cursors.push({
          x: state.cursor.x,
          y: state.cursor.y,
          userId: state.user?.id ?? String(clientId),
          color: state.user?.color ?? "#888",
          name: state.user?.name ?? "Anonymous",
        })
      })

      setRemoteCursors(cursors)
      setOnlineUsers(users)
    }

    awareness.on("change", handleAwarenessChange)

    return () => {
      shapesMap.unobserveDeep(syncShapes)
      awareness.off("change", handleAwarenessChange)
      provider.destroy()
      providerRef.current = null
      awarenessRef.current = null
      shapesMapRef.current = null
    }
  }, [boardId, user?.userId, user?.color, user?.displayName])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const updateCursor = useCallback(
    throttle((cursor: Cursor) => {
      awarenessRef.current?.setLocalStateField("cursor", cursor)
    }, CURSOR_THROTTLE_MS),
    [boardId],
  )

  const addShape = useCallback((shape: Shape) => {
    shapesMapRef.current?.set(shape.id, shape)
  }, [])

  const updateShape = useCallback((id: string, updates: Partial<Shape>) => {
    const map = shapesMapRef.current
    if (!map) return
    const existing = map.get(id)
    if (!existing) return
    map.set(id, { ...existing, ...updates } as Shape)
  }, [])

  const removeShape = useCallback((id: string) => {
    shapesMapRef.current?.delete(id)
  }, [])

  return {
    shapes,
    remoteCursors,
    onlineUsers,
    updateCursor,
    addShape,
    updateShape,
    removeShape,
  }
}
