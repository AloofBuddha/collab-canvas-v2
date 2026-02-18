/**
 * useAIChat — hook for sending AI prompts to the PartyKit server
 * and applying the resulting shape operations to the board.
 *
 * Uses a separate PartySocket connection dedicated to AI messages
 * (the Yjs provider uses its own binary WebSocket).
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
  message: string
  error?: string
}

/** Try to extract a JSON string from a WebSocket message (could be string, Blob, or ArrayBuffer) */
async function extractText(data: unknown): Promise<string | null> {
  if (typeof data === 'string') return data
  if (data instanceof Blob) {
    // Blobs under ~1KB are likely Yjs binary sync; AI responses are JSON text
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
  const socketRef = useRef<PartySocket | null>(null)

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

      if (data.error) {
        console.error('[AI]', data.error)
        return
      }

      // Apply operations to the board
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
            const merged = { ...newShape, ...op.shape, id: newShape.id, createdBy: userId }
            addShape(merged as Shape)
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
    })

    socketRef.current = socket
    return () => {
      socket.close()
      socketRef.current = null
    }
  }, [boardId])

  const sendMessage = useCallback((prompt: string) => {
    if (!socketRef.current) return

    setIsLoading(true)

    const currentShapes = shapesRef.current
    const shapeList = Object.values(currentShapes).map(s => ({
      id: s.id,
      type: s.type,
      x: s.x,
      y: s.y,
      color: s.color,
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

  return { isLoading, sendMessage }
}
