/**
 * useAIChat — hook for sending AI prompts to the PartyKit server and
 * applying the resulting shape operations to the board.
 *
 * Supports the vision iteration loop: after applying a batch of operations,
 * if the server flags requestReview=true, we render the current Konva canvas
 * to a PNG via stage.toDataURL() and post it back as an ai-review message.
 * Claude critiques + emits surgical fixes (or finishedDrawing) on the next
 * turn. Caps at 3 iterations on the server.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import PartySocket from 'partysocket'
import type Konva from 'konva'
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
  sessionId: string
  operations: AIOperation[]
  groups?: Record<string, { name: string }>
  message: string
  requestReview: boolean
  done: boolean
  error?: string
}

export interface AIHistoryEntry {
  id: string
  prompt: string
  sentAt: number
  refine: boolean
  groupIds: string[]
  opCount?: number
  reply?: string
  error?: string
}

/** The AI bar surfaces this for cosmetic distinction between "Claude is
 *  drawing" and "Claude is reviewing its work" — both block input but the
 *  user gets a hint at what's happening. */
export type AIPhase = 'idle' | 'painting' | 'reviewing'

async function extractText(data: unknown): Promise<string | null> {
  if (typeof data === 'string') return data
  if (data instanceof Blob) {
    try { return await data.text() } catch { return null }
  }
  if (data instanceof ArrayBuffer) {
    try { return new TextDecoder().decode(data) } catch { return null }
  }
  return null
}

/** Render the current stage to a base64 PNG string (no data: prefix). */
function stageToBase64Png(stage: Konva.Stage | null): string | null {
  if (!stage) return null
  // Cap pixel dimensions to keep the upload reasonable — Claude doesn't need
  // a 4K screenshot to assess "is this a firetruck".
  const dataUrl = stage.toDataURL({
    pixelRatio: Math.min(1, 1024 / Math.max(stage.width(), stage.height())),
    mimeType: 'image/png',
  })
  const comma = dataUrl.indexOf(',')
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
}

export function useAIChat(
  boardId: string,
  userId: string,
  shapes: Record<string, Shape>,
  addShape: (shape: Shape) => void,
  updateShape: (id: string, updates: Partial<Shape>) => void,
  removeShape: (id: string) => void,
  stageRef: React.RefObject<Konva.Stage | null>,
) {
  const [phase, setPhase] = useState<AIPhase>('idle')
  const [history, setHistory] = useState<AIHistoryEntry[]>([])
  const [groupNames, setGroupNames] = useState<Record<string, string>>({})
  const socketRef = useRef<PartySocket | null>(null)
  const pendingTurnIdRef = useRef<string | null>(null)
  // The active session ID for review round-trips; cleared when the server
  // marks done=true (or never set if the server didn't open one).
  const activeSessionIdRef = useRef<string | null>(null)

  const callbacksRef = useRef({ addShape, updateShape, removeShape, userId, stageRef })
  useEffect(() => {
    callbacksRef.current = { addShape, updateShape, removeShape, userId, stageRef }
  })

  const shapesRef = useRef(shapes)
  useEffect(() => { shapesRef.current = shapes })

  useEffect(() => {
    const socket = new PartySocket({ host: PARTYKIT_HOST, room: boardId })

    socket.addEventListener('message', async (event) => {
      const text = await extractText(event.data)
      if (!text) return
      let data: AIResponse
      try { data = JSON.parse(text) }
      catch { return }
      if (data.type !== 'ai-response') return

      const { addShape, updateShape, removeShape, userId, stageRef } = callbacksRef.current
      const turnId = pendingTurnIdRef.current

      if (data.error) {
        console.error('[AI]', data.error)
        activeSessionIdRef.current = null
        setPhase('idle')
        if (turnId) {
          setHistory(h => h.map(e => e.id === turnId ? { ...e, error: data.error } : e))
          pendingTurnIdRef.current = null
        }
        return
      }

      // Apply this batch of operations to the board.
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
            if (merged.type === 'path') {
              if (!merged.viewBoxWidth) merged.viewBoxWidth = merged.width
              if (!merged.viewBoxHeight) merged.viewBoxHeight = merged.height
            }
            addShape(merged)
            if (merged.groupId) newGroupIds.add(merged.groupId)
            break
          }
          case 'update': {
            if (op.shapeId && op.updates) updateShape(op.shapeId, op.updates)
            break
          }
          case 'delete': {
            if (op.shapeId) removeShape(op.shapeId)
            break
          }
        }
      }

      if (data.groups && Object.keys(data.groups).length > 0) {
        setGroupNames(prev => {
          const next = { ...prev }
          for (const [gid, meta] of Object.entries(data.groups!)) next[gid] = meta.name
          return next
        })
      }

      if (turnId) {
        setHistory(h => h.map(e => e.id === turnId ? {
          ...e,
          opCount: (e.opCount ?? 0) + data.operations.length,
          reply: data.message || e.reply,
          groupIds: e.groupIds.length > 0 ? e.groupIds : Array.from(newGroupIds),
        } : e))
      }

      // Branching: request a review pass, or finish.
      if (data.requestReview && data.sessionId) {
        activeSessionIdRef.current = data.sessionId
        setPhase('reviewing')
        // Let React/Konva commit the new shapes before screenshotting.
        // requestAnimationFrame x2 + a short timeout is a belt-and-suspenders
        // way to wait for layout + paint to settle on slow machines.
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => {
            setTimeout(resolve, 80)
          }))
        })
        const image = stageToBase64Png(stageRef.current)
        if (!image) {
          console.warn('[AI] could not render stage to PNG; skipping review')
          activeSessionIdRef.current = null
          setPhase('idle')
          pendingTurnIdRef.current = null
          return
        }
        socketRef.current?.send(JSON.stringify({
          type: 'ai-review',
          sessionId: data.sessionId,
          image,
        }))
        // Keep pendingTurnIdRef so the next response is attributed to the
        // same history entry.
      } else {
        // Done — no more rounds. Reset.
        activeSessionIdRef.current = null
        setPhase('idle')
        pendingTurnIdRef.current = null
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
    activeSessionIdRef.current = null
    setPhase('painting')
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

  // isLoading is true whenever Claude is doing anything (painting or reviewing).
  // The AIBar can read `phase` if it wants to distinguish the two visually.
  const isLoading = phase !== 'idle'

  return { isLoading, phase, sendMessage, history, groupNames }
}
