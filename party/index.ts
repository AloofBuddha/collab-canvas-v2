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

    const apiKey = this.room.env.XAI_API_KEY as string | undefined
    if (!apiKey) {
      const errorResponse: AIResponse = {
        type: 'ai-response',
        operations: [],
        message: '',
        error: 'AI API key not configured on server.',
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
