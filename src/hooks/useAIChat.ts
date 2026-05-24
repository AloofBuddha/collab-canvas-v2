/**
 * useAIChat — hook for sending AI prompts to the PartyKit server
 * and applying the resulting shape operations to the board.
 *
 * Uses a separate PartySocket connection dedicated to AI messages
 * (the Yjs provider uses its own binary WebSocket).
 *
 * Also tracks:
 *   - history: a session-local turn list, used by the AI bar's thread peek.
 *   - groupNames: map of groupId → human name (returned by the server's
 *     composeArtifact tool) so the bar can show "EDITING · Fire truck" when
 *     a user selects an AI-made artifact.
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import PartySocket from 'partysocket'
import type { Shape } from '../types'
import { createShape } from '../utils/shapeFactory'

const PARTYKIT_HOST = import.meta.env.VITE_PARTYKIT_HOST ?? 'localhost:1999'

interface AIOperation {
  action: 'create' | 'update' | 'delete'
  shape?: Partial<Shape> & { type: string }
  shapeId?: string
  updates?: Partial<Shape>
}

interface AIResponse {
  type: 'ai-response'
  operations: AIOperation[]
  groups?: Record<string, { name: string }>
  message: string
  error?: string
}

export interface AIHistoryEntry {
  id: string
  prompt: string
  /** ms epoch when the prompt was sent */
  sentAt: number
  /** Whether this prompt was scoped to refining an existing artifact */
  refine: boolean
  /** Group(s) created or extended by this prompt, populated on response */
  groupIds: string[]
  /** Once the response arrives: how many ops it produced */
  opCount?: number
  /** Final AI message text (the one-sentence summary) */
  reply?: string
  /** Error if the request failed */
  error?: string
}

/** Try to extract a JSON string from a WebSocket message (could be string, Blob, or ArrayBuffer) */
async function extractText(data: unknown): Promise<string | null> {
  if (typeof data === 'string') return data
  if (data instanceof Blob) {
    try {
      return await data.text()
    } catch {
      return null
    }
  }
  if (data instanceof ArrayBuffer) {
    try {
      return new TextDecoder().decode(data)
    } catch {
      return null
    }
  }
  return null
}

export function useAIChat(
  boardId: string,
  userId: string,
  shapes: Record<string, Shape>,
  addShape: (shape: Shape) => void,
  updateShape: (id: string, updates: Partial<Shape>) => void,
  removeShape: (id: string) => void,
) {
  const [isLoading, setIsLoading] = useState(false)
  const [history, setHistory] = useState<AIHistoryEntry[]>([])
  const [groupNames, setGroupNames] = useState<Record<string, string>>({})
  const socketRef = useRef<PartySocket | null>(null)

  // Track the in-flight turn so we can attach response metadata to it.
  const pendingTurnIdRef = useRef<string | null>(null)

  // Store callbacks in refs so the socket message handler always reads
  // the latest without needing to reconnect when they change identity.
  const callbacksRef = useRef({ addShape, updateShape, removeShape, userId })
  useEffect(() => {
    callbacksRef.current = { addShape, updateShape, removeShape, userId }
  })

  // Store shapes in ref for sendMessage to read latest without re-creating callback
  const shapesRef = useRef(shapes)
  useEffect(() => { shapesRef.current = shapes })

  // Socket lifecycle — only depends on boardId
  useEffect(() => {
    const socket = new PartySocket({
      host: PARTYKIT_HOST,
      room: boardId,
    })

    socket.addEventListener('message', async (event) => {
      const text = await extractText(event.data)
      if (!text) return

      let data: AIResponse
      try {
        data = JSON.parse(text)
      } catch {
        return // Not JSON — Yjs binary sync
      }

      if (data.type !== 'ai-response') return

      setIsLoading(false)
      const { addShape, updateShape, removeShape, userId } = callbacksRef.current
      const turnId = pendingTurnIdRef.current
      pendingTurnIdRef.current = null

      if (data.error) {
        console.error('[AI]', data.error)
        if (turnId) {
          setHistory(h => h.map(e => e.id === turnId ? { ...e, error: data.error } : e))
        }
        return
      }

      // Apply operations to the board. Collect the groupIds that appeared in
      // this turn so we can attach them to the history entry afterwards.
      const newGroupIds = new Set<string>()
      for (const op of data.operations) {
        switch (op.action) {
          case 'create': {
            if (!op.shape) break
            const newShape = createShape(
              op.shape.type as Shape['type'],
              op.shape.x as number || 100,
              op.shape.y as number || 100,
              userId,
            )
            const merged = { ...newShape, ...op.shape, id: newShape.id, createdBy: userId } as Shape
            // For paths from the AI, capture viewBox = current width/height so
            // subsequent user resizing scales the d data via the renderer.
            if (merged.type === 'path') {
              if (!merged.viewBoxWidth) merged.viewBoxWidth = merged.width
              if (!merged.viewBoxHeight) merged.viewBoxHeight = merged.height
            }
            addShape(merged)
            if (merged.groupId) newGroupIds.add(merged.groupId)
            break
          }
          case 'update': {
            if (op.shapeId && op.updates) {
              updateShape(op.shapeId, op.updates)
            }
            break
          }
          case 'delete': {
            if (op.shapeId) {
              removeShape(op.shapeId)
            }
            break
          }
        }
      }

      // Merge group names so the bar can show "EDITING · Fire truck" later.
      if (data.groups && Object.keys(data.groups).length > 0) {
        setGroupNames(prev => {
          const next = { ...prev }
          for (const [gid, meta] of Object.entries(data.groups!)) {
            next[gid] = meta.name
          }
          return next
        })
      }

      if (turnId) {
        setHistory(h => h.map(e => e.id === turnId ? {
          ...e,
          opCount: data.operations.length,
          reply: data.message,
          groupIds: Array.from(newGroupIds),
        } : e))
      }
    })

    socketRef.current = socket
    return () => {
      socket.close()
      socketRef.current = null
    }
  }, [boardId])

  const sendMessage = useCallback((prompt: string, opts?: { refine?: boolean }) => {
    if (!socketRef.current) return
    const turnId = `turn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    pendingTurnIdRef.current = turnId
    setIsLoading(true)
    setHistory(h => [{
      id: turnId,
      prompt,
      sentAt: Date.now(),
      refine: !!opts?.refine,
      groupIds: [],
    }, ...h])

    const currentShapes = shapesRef.current
    const shapeList = Object.values(currentShapes).map(s => ({
      id: s.id,
      type: s.type,
      x: s.x,
      y: s.y,
      color: s.color,
      groupId: s.groupId,
      ...('width' in s ? { width: s.width } : {}),
      ...('height' in s ? { height: s.height } : {}),
      ...('radiusX' in s ? { radiusX: s.radiusX } : {}),
      ...('radiusY' in s ? { radiusY: s.radiusY } : {}),
      ...('label' in s && s.label ? { label: s.label } : {}),
      ...('text' in s ? { text: s.text } : {}),
    }))

    socketRef.current.send(JSON.stringify({
      type: 'ai-request',
      prompt,
      shapes: shapeList,
    }))
  }, [])

  return { isLoading, sendMessage, history, groupNames }
}
