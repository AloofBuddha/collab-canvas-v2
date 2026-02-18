/**
 * AI Agent for CollabBoard — runs on PartyKit server (Cloudflare Edge)
 *
 * Uses xAI (Grok) via OpenAI-compatible API.
 * Tools simulate shape CRUD on a virtual board state,
 * recording operations for the client to apply via Yjs.
 */

import OpenAI from 'openai'
import type { ChatCompletionTool, ChatCompletionMessageParam } from 'openai/resources/chat/completions'

// ============================================================================
// Types
// ============================================================================

/** Mirrors the client-side Shape type (minimal subset needed for AI) */
interface ShapeData {
  id: string
  type: 'rectangle' | 'circle' | 'line' | 'text' | 'sticky'
  x: number
  y: number
  width?: number
  height?: number
  radiusX?: number
  radiusY?: number
  x2?: number
  y2?: number
  color: string
  label?: string
  labelFontSize?: number
  labelColor?: string
  text?: string
  arrowStart?: boolean
  arrowEnd?: boolean
  strokeWidth?: number
  [key: string]: unknown
}

export interface AIOperation {
  action: 'create' | 'update' | 'delete'
  shape?: Partial<ShapeData> & { type: string }
  shapeId?: string
  updates?: Partial<ShapeData>
}

export interface AIRequest {
  type: 'ai-request'
  prompt: string
  shapes: ShapeData[]
}

export interface AIResponse {
  type: 'ai-response'
  operations: AIOperation[]
  message: string
  error?: string
}

// ============================================================================
// Tool Definitions
// ============================================================================

const tools: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'createShape',
      description: 'Create a new shape on the canvas. Returns the temporary ID of the created shape.',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['rectangle', 'circle', 'line', 'text', 'sticky'],
            description: 'The type of shape to create',
          },
          x: { type: 'number', description: 'X position (left edge for rect/text/sticky, center for circle, start for line)' },
          y: { type: 'number', description: 'Y position (top edge for rect/text/sticky, center for circle, start for line)' },
          width: { type: 'number', description: 'Width (for rectangle, text, sticky)' },
          height: { type: 'number', description: 'Height (for rectangle, text, sticky)' },
          radiusX: { type: 'number', description: 'Horizontal radius (for circle/ellipse)' },
          radiusY: { type: 'number', description: 'Vertical radius (for circle/ellipse)' },
          x2: { type: 'number', description: 'End X position (for line)' },
          y2: { type: 'number', description: 'End Y position (for line)' },
          color: { type: 'string', description: 'Fill color (hex, e.g. #BBF7D0)' },
          label: { type: 'string', description: 'Centered label text displayed on the shape' },
          labelFontSize: { type: 'number', description: 'Label font size in pixels (auto-scales if omitted)' },
          labelColor: { type: 'string', description: 'Label text color (default: #374151)' },
          text: { type: 'string', description: 'Text content (for text and sticky shapes)' },
          arrowStart: { type: 'boolean', description: 'Show arrowhead at start of line' },
          arrowEnd: { type: 'boolean', description: 'Show arrowhead at end of line' },
          strokeWidth: { type: 'number', description: 'Stroke width (for lines, default 2)' },
        },
        required: ['type', 'x', 'y'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'updateShape',
      description: 'Update properties of an existing shape.',
      parameters: {
        type: 'object',
        properties: {
          shapeId: { type: 'string', description: 'The ID of the shape to update' },
          x: { type: 'number' },
          y: { type: 'number' },
          width: { type: 'number' },
          height: { type: 'number' },
          radiusX: { type: 'number' },
          radiusY: { type: 'number' },
          x2: { type: 'number' },
          y2: { type: 'number' },
          color: { type: 'string' },
          label: { type: 'string' },
          labelFontSize: { type: 'number' },
          labelColor: { type: 'string' },
          text: { type: 'string' },
          arrowStart: { type: 'boolean' },
          arrowEnd: { type: 'boolean' },
        },
        required: ['shapeId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'deleteShape',
      description: 'Delete a shape from the canvas.',
      parameters: {
        type: 'object',
        properties: {
          shapeId: { type: 'string', description: 'The ID of the shape to delete' },
        },
        required: ['shapeId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listShapes',
      description: 'List all shapes currently on the canvas with their properties.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
]

// ============================================================================
// AI Agent Runner
// ============================================================================

const SYSTEM_PROMPT = `You are a collaborative whiteboard AI assistant for CollabBoard. You help users create diagrams, organize content, and manipulate shapes on an infinite canvas.

Available shape types:
- rectangle: A colored rectangle. Use 'label' for centered text. Great for diagrams, SWOT analyses, etc.
- circle: An ellipse. Use 'label' for centered text.
- line: A line/arrow. Use arrowEnd/arrowStart for directional arrows.
- text: Editable text block.
- sticky: A sticky note with text.

When creating diagrams:
- Use professional, readable spacing (leave gaps between shapes)
- Use distinct, soft colors for different categories
- Position shapes relative to the canvas center area (around x:200-800, y:100-600)
- Use labels on rectangles/circles for titled sections

For SWOT analysis, use:
- Strengths: #BBF7D0 (green), Weaknesses: #FECACA (red)
- Opportunities: #BFDBFE (blue), Threats: #FDE68A (yellow)

Always explain what you created after using tools.`

const MAX_TOOL_ROUNDS = 10

export async function runAIAgent(
  apiKey: string,
  prompt: string,
  currentShapes: ShapeData[],
): Promise<AIResponse> {
  const client = new OpenAI({
    apiKey,
    baseURL: 'https://api.x.ai/v1',
  })

  const operations: AIOperation[] = []
  // Virtual board state for multi-step reasoning
  const virtualShapes = [...currentShapes]
  let tempIdCounter = 0

  function executeTool(name: string, args: Record<string, unknown>): string {
    switch (name) {
      case 'createShape': {
        const tempId = `ai-temp-${++tempIdCounter}`
        const shape: Partial<ShapeData> & { type: ShapeData['type'] } = {
          type: args.type as ShapeData['type'],
          x: args.x as number,
          y: args.y as number,
          color: (args.color as string) || '#D1D5DB',
        }
        // Copy optional props
        for (const key of ['width', 'height', 'radiusX', 'radiusY', 'x2', 'y2',
          'label', 'labelFontSize', 'labelColor', 'text', 'arrowStart', 'arrowEnd', 'strokeWidth']) {
          if (args[key] !== undefined) {
            (shape as Record<string, unknown>)[key] = args[key]
          }
        }
        operations.push({ action: 'create', shape })
        virtualShapes.push({ id: tempId, ...shape } as ShapeData)
        return JSON.stringify({ success: true, shapeId: tempId })
      }

      case 'updateShape': {
        const { shapeId, ...updates } = args
        const idx = virtualShapes.findIndex(s => s.id === shapeId)
        if (idx === -1) return JSON.stringify({ error: `Shape ${shapeId} not found` })
        Object.assign(virtualShapes[idx], updates)
        operations.push({ action: 'update', shapeId: shapeId as string, updates: updates as Partial<ShapeData> })
        return JSON.stringify({ success: true })
      }

      case 'deleteShape': {
        const { shapeId } = args
        const idx = virtualShapes.findIndex(s => s.id === shapeId)
        if (idx === -1) return JSON.stringify({ error: `Shape ${shapeId} not found` })
        virtualShapes.splice(idx, 1)
        operations.push({ action: 'delete', shapeId: shapeId as string })
        return JSON.stringify({ success: true })
      }

      case 'listShapes': {
        return JSON.stringify(virtualShapes.map(s => ({
          id: s.id, type: s.type, x: s.x, y: s.y,
          width: s.width, height: s.height,
          label: s.label, text: s.text, color: s.color,
        })))
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` })
    }
  }

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Current board has ${currentShapes.length} shapes.\n\nUser request: ${prompt}`,
    },
  ]

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await client.chat.completions.create({
        model: 'grok-3-mini',
        messages,
        tools,
        tool_choice: round === 0 ? 'auto' : 'auto',
      })

      const choice = response.choices[0]
      if (!choice.message) break

      messages.push(choice.message)

      // If no tool calls, AI is done — return its final message
      if (!choice.message.tool_calls || choice.message.tool_calls.length === 0) {
        return {
          type: 'ai-response',
          operations,
          message: choice.message.content || 'Done.',
        }
      }

      // Execute tool calls and add results
      for (const toolCall of choice.message.tool_calls) {
        if (toolCall.type !== 'function') continue
        const args = JSON.parse(toolCall.function.arguments)
        const result = executeTool(toolCall.function.name, args)
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result,
        })
      }
    }

    // Exceeded max rounds — return what we have
    return {
      type: 'ai-response',
      operations,
      message: 'Completed (reached maximum steps).',
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    return {
      type: 'ai-response',
      operations: [],
      message: '',
      error: `AI agent error: ${errorMessage}`,
    }
  }
}
