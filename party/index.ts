import { routePartykitRequest, type Connection, type WSMessage } from "partyserver"
import { YServer } from "y-partyserver"
import * as Y from "yjs"
import { runAIAgent } from "./ai"
import type { AIRequest, AIResponse, AIReviewRequest, MessageParam } from "./ai"

// Cap the number of review/critique passes per session. The initial draw is
// turn 1; each subsequent ai-review message bumps it. Keeps cost + latency
// bounded — most artifacts don't benefit from more than 1-2 critique passes.
const MAX_ITERATIONS = 3

interface AISession {
  /** API key captured at session start (so it doesn't have to be re-read). */
  apiKey: string
  /** Running Claude message history — extends every turn. */
  messages: MessageParam[]
  /** Number of turns served so far (initial = 1, each ai-review = +1). */
  iteration: number
  /** Best-effort name for the artifact, used in the critique prompt. */
  artifactName: string
}

interface Env {
  Main: DurableObjectNamespace<Main>
  ANTHROPIC_API_KEY?: string
}

// Durable Object storage caps a single value at 2 MB, so the Yjs snapshot is
// split into chunks. All chunks + the count go in one atomic put().
const CHUNK_BYTES = 1_000_000

interface IncomingMessage {
  type?: string
}

// One Durable Object per board ("main" party, room = boardId).
export class Main extends YServer<Env> {
  // Per-instance map of sessionId → in-progress AI session. There's one
  // instance per room, so this scales with active boards.
  private sessions = new Map<string, AISession>()

  // Snapshot the Yjs doc into durable storage (debounced by YServer, and on
  // room empty). Without this the doc is wiped on eviction or deploy.
  async onLoad() {
    const count = await this.ctx.storage.get<number>("doc:count")
    if (!count) return
    const keys = Array.from({ length: count }, (_, i) => `doc:${i}`)
    const parts = await this.ctx.storage.get<Uint8Array>(keys)
    const chunks = keys.map(k => parts.get(k)!)
    const update = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0))
    let offset = 0
    for (const c of chunks) { update.set(c, offset); offset += c.length }
    Y.applyUpdate(this.document, update)
  }

  async onSave() {
    const update = Y.encodeStateAsUpdate(this.document)
    const entries: Record<string, unknown> = {}
    let i = 0
    for (; i * CHUNK_BYTES < update.length; i++) {
      entries[`doc:${i}`] = update.slice(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES)
    }
    entries["doc:count"] = i
    // ponytail: stale chunks past doc:count are ignored, not deleted
    await this.ctx.storage.put(entries)
  }

  onMessage(sender: Connection, message: WSMessage) {
    // Yjs binary frames and provider custom messages go to YServer; plain
    // JSON strings are AI requests from useAIChat's separate PartySocket.
    if (typeof message !== 'string' || message.startsWith('__YPS:')) {
      return super.onMessage(sender, message)
    }
    return this.handleJSON(message, sender)
  }

  private async handleJSON(message: string, sender: Connection) {
    let parsed: IncomingMessage
    try { parsed = JSON.parse(message) }
    catch { return }

    if (parsed.type === 'ai-request') {
      await this.handleAIRequest(parsed as AIRequest, sender)
    } else if (parsed.type === 'ai-review') {
      await this.handleAIReview(parsed as AIReviewRequest, sender)
    }
  }

  // ==========================================================================
  // ai-request: initial draw turn
  // ==========================================================================

  private async handleAIRequest(req: AIRequest, sender: Connection) {
    const apiKey = this.requireApiKey(sender, req)
    if (!apiKey) return

    const sessionId = `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    let streamedAny = false
    try {
      const result = await runAIAgent({
        apiKey,
        currentShapes: req.shapes,
        initial: { prompt: req.prompt },
        onRound: async (round) => {
          // Stream each round's batch as a partial as soon as it lands.
          streamedAny = true
          const partial: AIResponse = {
            type: 'ai-response',
            sessionId,
            operations: round.operations,
            groups: round.groups,
            message: '',
            partial: true,
            requestReview: false,
            done: false,
          }
          sender.send(JSON.stringify(partial))
        },
      })

      // Capture the artifact's name (first new group) for the critique prompt.
      const newGroupNames = Object.values(result.groups)
      const artifactName = newGroupNames[0]?.name ?? req.prompt.slice(0, 40)

      const shouldReview = !result.finished
        && result.operations.length > 0
        && !result.error
      if (shouldReview) {
        this.sessions.set(sessionId, {
          apiKey,
          messages: result.messages,
          iteration: 1,
          artifactName,
        })
      }

      // Final response: if we already streamed partials, the ops have all
      // been delivered, so the final message carries empty ops + the
      // requestReview/done metadata. If nothing streamed (single-shot result),
      // send everything in one final non-partial response.
      const response: AIResponse = {
        type: 'ai-response',
        sessionId,
        operations: streamedAny ? [] : result.operations,
        groups: streamedAny ? {} : result.groups,
        message: result.message,
        partial: false,
        requestReview: shouldReview,
        done: !shouldReview,
        error: result.error,
      }
      sender.send(JSON.stringify(response))
    } catch (err) {
      sender.send(JSON.stringify({
        type: 'ai-response',
        sessionId,
        operations: [],
        message: '',
        partial: false,
        requestReview: false,
        done: true,
        error: `Server error: ${err instanceof Error ? err.message : 'Unknown'}`,
      } satisfies AIResponse))
    }
  }

  // ==========================================================================
  // ai-review: critique-pass turn (client supplies a canvas screenshot)
  // ==========================================================================

  private async handleAIReview(req: AIReviewRequest, sender: Connection) {
    const session = this.sessions.get(req.sessionId)
    if (!session) {
      const errorResponse: AIResponse = {
        type: 'ai-response',
        sessionId: req.sessionId,
        operations: [],
        message: '',
        partial: false,
        requestReview: false,
        done: true,
        error: 'No active session — review skipped.',
      }
      sender.send(JSON.stringify(errorResponse))
      return
    }

    let streamedAny = false
    try {
      const result = await runAIAgent({
        apiKey: session.apiKey,
        currentShapes: [],
        review: {
          priorMessages: session.messages,
          imageBase64: req.image,
          artifactName: session.artifactName,
          iteration: session.iteration + 1,
        },
        onRound: async (round) => {
          streamedAny = true
          const partial: AIResponse = {
            type: 'ai-response',
            sessionId: req.sessionId,
            operations: round.operations,
            groups: round.groups,
            message: '',
            partial: true,
            requestReview: false,
            done: false,
          }
          sender.send(JSON.stringify(partial))
        },
      })

      const nextIteration = session.iteration + 1
      const reachedCap = nextIteration >= MAX_ITERATIONS
      const shouldReviewAgain = !result.finished
        && !reachedCap
        && result.operations.length > 0
        && !result.error

      if (shouldReviewAgain) {
        this.sessions.set(req.sessionId, {
          ...session,
          messages: result.messages,
          iteration: nextIteration,
        })
      } else {
        this.sessions.delete(req.sessionId)
      }

      const response: AIResponse = {
        type: 'ai-response',
        sessionId: req.sessionId,
        operations: streamedAny ? [] : result.operations,
        groups: streamedAny ? {} : result.groups,
        message: result.message,
        partial: false,
        requestReview: shouldReviewAgain,
        done: !shouldReviewAgain,
        error: result.error,
      }
      sender.send(JSON.stringify(response))
    } catch (err) {
      this.sessions.delete(req.sessionId)
      sender.send(JSON.stringify({
        type: 'ai-response',
        sessionId: req.sessionId,
        operations: [],
        message: '',
        partial: false,
        requestReview: false,
        done: true,
        error: `Server error during review: ${err instanceof Error ? err.message : 'Unknown'}`,
      } satisfies AIResponse))
    }
  }

  // ==========================================================================
  // Shared: env validation + logging
  // ==========================================================================

  private requireApiKey(sender: Connection, req: AIRequest): string | null {
    const apiKey = this.env.ANTHROPIC_API_KEY

    const envNames = Object.keys(this.env)
    const fingerprint = apiKey
      ? `${apiKey.slice(0, 8)}…${apiKey.slice(-4)} (len=${apiKey.length})`
      : '<missing>'
    console.log('[ai] request received', {
      envVarsAvailable: envNames,
      anthropicKey: fingerprint,
      anthropicKeyStartsWithSkAnt: apiKey?.startsWith('sk-ant-') ?? false,
      promptPreview: req.prompt?.slice(0, 60),
      shapesCount: req.shapes?.length ?? 0,
    })

    if (!apiKey) {
      sender.send(JSON.stringify({
        type: 'ai-response',
        sessionId: '',
        operations: [],
        message: '',
        partial: false,
        requestReview: false,
        done: true,
        error: 'ANTHROPIC_API_KEY not configured on server.',
      } satisfies AIResponse))
      return null
    }
    if (!apiKey.startsWith('sk-ant-')) {
      sender.send(JSON.stringify({
        type: 'ai-response',
        sessionId: '',
        operations: [],
        message: '',
        partial: false,
        requestReview: false,
        done: true,
        error: `ANTHROPIC_API_KEY has wrong format (expected sk-ant-…, got "${apiKey.slice(0, 6)}…"). Set the Anthropic key, not xAI / OpenAI.`,
      } satisfies AIResponse))
      return null
    }
    return apiKey
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return (await routePartykitRequest(request, env)) ?? new Response("Not Found", { status: 404 })
  },
} satisfies ExportedHandler<Env>
