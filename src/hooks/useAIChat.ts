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
import type { RemoteCursor, Shape } from '../types'
import { createShape } from '../utils/shapeFactory'

const PARTYKIT_HOST = import.meta.env.VITE_PARTYKIT_HOST ?? 'localhost:1999'

/** Claude's identity on the canvas — coral accent so its cursor reads
 *  distinctly from human users (who pick from a different palette). */
const CLAUDE_USER_ID = '__claude__'
const CLAUDE_NAME = 'Claude'
const CLAUDE_COLOR = '#C96442'

/** Delay (ms) between paced operation applications. Long enough that the
 *  cursor visibly walks from shape to shape rather than blurring through.
 *  Skipped for trivial batches so a single tweak still feels instant. */
const PACE_STEP_MS = 150
const PACE_THRESHOLD = 3
/** How long the cursor lingers at its final position before vanishing. */
const CURSOR_LINGER_MS = 600

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
  /** Set when the server is streaming a batch — more is coming on this
   *  session. Apply ops but don't end loading or trigger a review. */
  partial: boolean
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

/** Best-effort center for an op. For creates we read the shape spec; for
 *  updates/deletes we fall back to the shape's current position in the board.
 *  Used purely for the synthetic Claude cursor's blip position — accuracy
 *  is cosmetic. */
function opCenter(
  op: AIOperation,
  shapes: Record<string, Shape>,
): { x: number; y: number } | null {
  if (op.action === 'create' && op.shape) {
    const s = op.shape as Partial<Shape> & { type: string }
    if (s.type === 'circle') {
      const c = s as Partial<Shape> & { radiusX?: number; radiusY?: number }
      return { x: (s.x ?? 0) + (c.radiusX ?? 0), y: (s.y ?? 0) + (c.radiusY ?? 0) }
    }
    if (s.type === 'line') {
      const l = s as Partial<Shape> & { x2?: number; y2?: number }
      return { x: ((s.x ?? 0) + (l.x2 ?? s.x ?? 0)) / 2, y: ((s.y ?? 0) + (l.y2 ?? s.y ?? 0)) / 2 }
    }
    const r = s as Partial<Shape> & { width?: number; height?: number }
    return { x: (s.x ?? 0) + (r.width ?? 0) / 2, y: (s.y ?? 0) + (r.height ?? 0) / 2 }
  }
  if ((op.action === 'update' || op.action === 'delete') && op.shapeId) {
    const shape = shapes[op.shapeId]
    if (!shape) return null
    if (shape.type === 'circle') return { x: shape.x + shape.radiusX, y: shape.y + shape.radiusY }
    if (shape.type === 'line') return { x: (shape.x + shape.x2) / 2, y: (shape.y + shape.y2) / 2 }
    return {
      x: shape.x + ('width' in shape ? shape.width / 2 : 0),
      y: shape.y + ('height' in shape ? shape.height / 2 : 0),
    }
  }
  return null
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

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
  /** Synthetic Claude cursor — moves to each new shape as it lands so the
   *  user sees Claude "working through" its batch instead of an instant flood
   *  of geometry. Null when Claude isn't active. */
  const [claudeCursor, setClaudeCursor] = useState<RemoteCursor | null>(null)
  /** Suppress the cursor briefly while we screenshot the canvas so it doesn't
   *  appear in the image Claude sees. */
  const cursorVisibleRef = useRef(true)
  const socketRef = useRef<PartySocket | null>(null)
  const pendingTurnIdRef = useRef<string | null>(null)
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
        setClaudeCursor(null)
        if (turnId) {
          setHistory(h => h.map(e => e.id === turnId ? { ...e, error: data.error } : e))
          pendingTurnIdRef.current = null
        }
        return
      }

      // Pace this batch of operations: cursor → apply → short delay → next.
      // Skips the delay for tiny batches so trivial updates feel instant.
      const newGroupIds = new Set<string>()
      const shouldPace = data.operations.length >= PACE_THRESHOLD
      for (const op of data.operations) {
        // Update cursor before applying so the visual leads the geometry.
        if (cursorVisibleRef.current) {
          const center = opCenter(op, shapesRef.current)
          if (center) {
            setClaudeCursor({
              userId: CLAUDE_USER_ID,
              name: CLAUDE_NAME,
              color: CLAUDE_COLOR,
              x: center.x,
              y: center.y,
            })
          }
        }

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
            // The toolbar default for polygon includes sides:6 (regular hexagon).
            // AI polygons are custom-vertex and don't pass `sides` — clear the
            // leaked default so the SidePanel treats them as custom geometry
            // and never regenerates points from `sides` on a width/height edit.
            if (merged.type === 'polygon' && (op.shape as Record<string, unknown>).sides === undefined) {
              delete (merged as { sides?: number }).sides
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

        if (shouldPace) await sleep(PACE_STEP_MS)
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

      // Partial: more is coming on this session. Apply, keep loading.
      if (data.partial) {
        return
      }

      // Branching: request a review pass, or finish.
      if (data.requestReview && data.sessionId) {
        activeSessionIdRef.current = data.sessionId
        setPhase('reviewing')
        // Hide Claude's cursor for the screenshot so it doesn't end up in the
        // image Claude reviews (which would be confusing — the model would
        // see its own pointer as a canvas object).
        cursorVisibleRef.current = false
        setClaudeCursor(null)
        // Let React/Konva commit the new shapes (and cursor removal) before
        // screenshotting. 2× rAF + short timeout = paint-settled belt-and-suspenders.
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => {
            setTimeout(resolve, 80)
          }))
        })
        const image = stageToBase64Png(stageRef.current)
        // Restore cursor visibility for the next paced batch.
        cursorVisibleRef.current = true
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
        // Done — let the cursor linger at its last position briefly, then clear.
        activeSessionIdRef.current = null
        setPhase('idle')
        pendingTurnIdRef.current = null
        setTimeout(() => setClaudeCursor(null), CURSOR_LINGER_MS)
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

  return { isLoading, phase, sendMessage, history, groupNames, claudeCursor }
}
