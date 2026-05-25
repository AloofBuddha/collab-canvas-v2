/**
 * AIBar — Direction A: adaptive bottom-docked AI command bar.
 *
 * Always visible. Four states it morphs through:
 *   - idle           empty canvas / no AI artifact selected
 *   - streaming      request in flight, model is painting
 *   - completed      latest AI artifact just landed (informational, transient)
 *   - refining       user has an AI-made group selected → bar scopes to it
 *
 * Above the bar: collapsible thread peek (session history).
 * Below the bar: chip rail (suggestions, context-aware).
 *
 * Faithful to the Direction A static prototype; what's deferred (because they
 * need server-side streaming infra that doesn't exist yet) — the per-shape
 * dashed→solid ghost animation and the AI's own canvas cursor.
 */

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Send, Square, Sparkles } from 'lucide-react'
import type { AIHistoryEntry, AIPhase } from '../hooks/useAIChat'
import styles from './AIBar.module.css'

export interface AIBarHandle {
  /** Focus the prompt input. */
  focus: () => void
}

interface AIBarProps {
  isLoading: boolean
  /** Distinguishes "painting" (first draft) from "reviewing" (vision pass).
   *  Both block the input; only the status line differs. */
  phase?: AIPhase
  /** Per-session prompt history. Currently used only to look up the in-flight
   *  prompt for streaming-state display; the persistent thread peek UI was
   *  removed to reclaim canvas space. */
  history: AIHistoryEntry[]
  /** Name of the currently selected AI-made artifact, or null. When set,
   *  the bar shifts into refine mode and scopes new prompts to it. */
  selectedArtifactName: string | null
  onSubmit: (prompt: string, opts: { refine: boolean }) => void
  /** Called when the user clicks the stop button while streaming. The current
   *  implementation can't actually cancel a streaming response — it just
   *  hides the button — but we wire the handler for the day we can. */
  onStop?: () => void
}


const AIBar = forwardRef<AIBarHandle, AIBarProps>(function AIBar({
  isLoading, phase = 'idle', history, selectedArtifactName, onSubmit, onStop,
}, ref) {
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }), [])

  // Auto-focus when not streaming so Ctrl+K-then-type just works.
  useEffect(() => {
    if (!isLoading) {
      const t = setTimeout(() => inputRef.current?.focus(), 50)
      return () => clearTimeout(t)
    }
  }, [isLoading])

  const isRefine = !!selectedArtifactName
  const pendingTurn = history.find(h => h.opCount === undefined && !h.error) ?? history[0]
  const runningPrompt = isLoading ? pendingTurn?.prompt ?? '' : ''
  const opsPlaced = isLoading ? pendingTurn?.opCount ?? 0 : 0
  const elapsed = useElapsedSeconds(isLoading ? pendingTurn?.sentAt : undefined)

  const placeholder =
    isLoading                  ? runningPrompt :
    isRefine                   ? `Refine ${selectedArtifactName}…` :
    history.length === 0       ? 'Ask Claude to draw something — a firetruck, a SWOT, a kanban…' :
                                 'Ask Claude — anything on the canvas, or start fresh'

  const submitDraft = () => {
    const v = draft.trim()
    if (!v || isLoading) return
    onSubmit(v, { refine: isRefine })
    setDraft('')
  }

  return (
    <div className={styles.stack} role="region" aria-label="AI assistant">
      <div className={isLoading ? styles.barStreaming : styles.bar}>
        <Avatar streaming={isLoading} />
        <div className={styles.barBody}>
          {isLoading ? (
            <>
              <div className={styles.runningPrompt}>
                <span className={styles.runningPromptText}>{runningPrompt}</span>
                <span className={styles.spinner} />
              </div>
              <div className={styles.statusLine}>
                <span className={styles.statusLineAccent}>
                  {phase === 'reviewing' ? 'reviewing' : 'painting'}
                </span>
                <span>·</span>
                <span>{describeProgress(phase, elapsed, opsPlaced)}</span>
              </div>
            </>
          ) : (
            <>
              {isRefine && (
                <div className={styles.modeLine}>
                  <span className={styles.modeDot} />
                  EDITING · {selectedArtifactName?.toUpperCase()}
                </div>
              )}
              <input
                ref={inputRef}
                className={styles.input}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    submitDraft()
                  }
                }}
                placeholder={placeholder}
                aria-label="AI prompt"
              />
            </>
          )}
        </div>
        {isLoading ? (
          <button className={styles.stopButton} title="Stop" onClick={() => onStop?.()} aria-label="Stop generation">
            <Square size={14} fill="currentColor" strokeWidth={0} />
          </button>
        ) : (
          <button
            className={draft.trim() ? styles.sendButtonActive : styles.sendButton}
            onClick={submitDraft}
            disabled={!draft.trim()}
            title="Send (Enter)"
            aria-label="Send prompt"
          >
            <Send size={16} />
          </button>
        )}
      </div>

    </div>
  )
})

export default AIBar

// ============================================================================
// Sub-components
// ============================================================================

/**
 * Live elapsed-seconds counter for the in-flight turn. Re-renders once per
 * second so the user sees concrete progress while Opus thinks.
 */
function useElapsedSeconds(startMs: number | undefined): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (startMs === undefined) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [startMs])
  return startMs === undefined ? 0 : Math.max(0, Math.floor((now - startMs) / 1000))
}

/**
 * One-line, ever-changing status that makes the long Opus call feel alive.
 * The progression: thinking → painting → reviewing → "still working" if slow.
 */
function describeProgress(phase: AIPhase, elapsed: number, opsPlaced: number): string {
  const time = elapsed > 0 ? `${elapsed}s` : ''
  if (phase === 'reviewing') {
    return time ? `Claude is reviewing · ${time}` : 'Claude is reviewing'
  }
  // painting (or initial idle moment before first paint)
  if (opsPlaced > 0) {
    return `placed ${opsPlaced} shape${opsPlaced === 1 ? '' : 's'} · ${time}`
  }
  if (elapsed >= 30) return `Claude is thinking · ${time} · Opus is thorough, hang tight`
  if (elapsed >= 10) return `Claude is thinking · ${time}`
  return time ? `Claude is composing · ${time}` : 'Claude is composing'
}

function Avatar({ streaming }: { streaming: boolean }) {
  return (
    <div className={streaming ? styles.avatarStreaming : styles.avatar}>
      C
      <span className={styles.avatarBadge}>
        <Sparkles size={9} strokeWidth={2} />
      </span>
    </div>
  )
}

