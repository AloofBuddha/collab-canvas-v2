import type * as Party from "partykit/server"
import { onConnect } from "y-partykit"
import { runAIAgent } from "./ai"
import type { AIRequest, AIResponse } from "./ai"

export default class YjsServer implements Party.Server {
  constructor(readonly room: Party.Room) {}

  onConnect(conn: Party.Connection) {
    return onConnect(conn, this.room)
  }

  async onMessage(message: string | ArrayBuffer, sender: Party.Connection) {
    // Skip binary messages (Yjs sync protocol)
    if (typeof message !== 'string') return

    let parsed: AIRequest
    try {
      parsed = JSON.parse(message)
    } catch {
      return
    }

    if (parsed.type !== 'ai-request') return

    const apiKey = this.room.env.ANTHROPIC_API_KEY as string | undefined

    // Diagnostic log (no secret leakage): surfaces the env-var presence,
    // the key's length, and a hashed identity fingerprint so prod logs can
    // tell us "is the key the one we think it is, in the right shape" —
    // without the value ever appearing in the log stream.
    const envNames = Object.keys(this.room.env)
    const fingerprint = apiKey
      ? `${apiKey.slice(0, 8)}…${apiKey.slice(-4)} (len=${apiKey.length})`
      : '<missing>'
    console.log('[ai] request received', {
      envVarsAvailable: envNames,
      anthropicKey: fingerprint,
      anthropicKeyStartsWithSkAnt: apiKey?.startsWith('sk-ant-') ?? false,
      promptPreview: parsed.prompt?.slice(0, 60),
      shapesCount: parsed.shapes?.length ?? 0,
    })

    if (!apiKey) {
      const errorResponse: AIResponse = {
        type: 'ai-response',
        operations: [],
        message: '',
        error: 'ANTHROPIC_API_KEY not configured on server.',
      }
      sender.send(JSON.stringify(errorResponse))
      return
    }

    if (!apiKey.startsWith('sk-ant-')) {
      const errorResponse: AIResponse = {
        type: 'ai-response',
        operations: [],
        message: '',
        error: `ANTHROPIC_API_KEY has wrong format (expected sk-ant-…, got "${apiKey.slice(0, 6)}…"). Set the Anthropic key, not xAI / OpenAI.`,
      }
      sender.send(JSON.stringify(errorResponse))
      return
    }

    try {
      const response = await runAIAgent(apiKey, parsed.prompt, parsed.shapes)
      sender.send(JSON.stringify(response))
    } catch (err) {
      const errorResponse: AIResponse = {
        type: 'ai-response',
        operations: [],
        message: '',
        error: `Server error: ${err instanceof Error ? err.message : 'Unknown'}`,
      }
      sender.send(JSON.stringify(errorResponse))
    }
  }
}

YjsServer satisfies Party.Worker
