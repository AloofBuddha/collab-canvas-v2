import { useCallback, useEffect, useRef, useState } from "react"
import { Doc, Map as YMap, UndoManager } from "yjs"
import YPartyKitProvider from "y-partykit/provider"
import type { Awareness } from "y-protocols/awareness"
import type { Cursor, RemoteCursor, Shape, User } from "../types/index.ts"
import { pickAvailableColor } from "../utils/userColors.ts"
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
  const [localColor, setLocalColor] = useState<string>("#888")
  const providerRef = useRef<YPartyKitProvider | null>(null)
  const awarenessRef = useRef<Awareness | null>(null)
  const shapesMapRef = useRef<YMap<Shape> | null>(null)
  const undoManagerRef = useRef<UndoManager | null>(null)

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

    // UndoManager tracks local changes to the shapes map.
    // Remote changes from other users are excluded by default.
    const undoManager = new UndoManager(shapesMap)
    undoManagerRef.current = undoManager

    // Set local user identity with per-room color assignment
    const clientIdStr = String(awareness.clientID)
    const id = user?.userId ?? clientIdStr
    const name = user?.displayName ?? generateGuestName(awareness.clientID)

    // Scan existing awareness states to find taken colors
    const takenColors = new Set<string>()
    awareness.getStates().forEach((state) => {
      const s = state as LocalAwarenessState
      if (s.user?.color) takenColors.add(s.user.color)
    })
    const color = pickAvailableColor(takenColors, id)
    setLocalColor(color)

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
      const localState = states.get(awareness.clientID)
      const myColor = localState?.user?.color

      // Resolve color conflicts: if a client with a lower clientID has the
      // same color, we yield and pick a new one. Lower clientID = priority.
      if (myColor) {
        let hasConflict = false
        const otherColors = new Set<string>()

        states.forEach((state, clientId) => {
          if (clientId === awareness.clientID) return
          if (!state.user?.color) return
          otherColors.add(state.user.color)
          if (state.user.color === myColor && clientId < awareness.clientID) {
            hasConflict = true
          }
        })

        if (hasConflict) {
          const newColor = pickAvailableColor(otherColors, id)
          setLocalColor(newColor)
          awareness.setLocalStateField("user", {
            ...localState!.user,
            color: newColor,
          })
          // Return early — our state change will trigger another awareness update
          return
        }
      }

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

      // Deduplicate users by Firebase userId (StrictMode double-mount
      // and multi-tab can create multiple awareness clients per user)
      const uniqueUsers = Array.from(
        new Map(users.map((u) => [u.userId, u])).values()
      )

      setRemoteCursors(cursors)
      setOnlineUsers(uniqueUsers)
    }

    awareness.on("change", handleAwarenessChange)

    return () => {
      shapesMap.unobserveDeep(syncShapes)
      awareness.off("change", handleAwarenessChange)
      undoManager.destroy()
      provider.destroy()
      providerRef.current = null
      awarenessRef.current = null
      shapesMapRef.current = null
      undoManagerRef.current = null
    }
  }, [boardId, user?.userId, user?.displayName])

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

  const undo = useCallback(() => {
    undoManagerRef.current?.undo()
  }, [])

  const redo = useCallback(() => {
    undoManagerRef.current?.redo()
  }, [])

  return {
    shapes,
    remoteCursors,
    onlineUsers,
    localColor,
    updateCursor,
    addShape,
    updateShape,
    removeShape,
    undo,
    redo,
  }
}
