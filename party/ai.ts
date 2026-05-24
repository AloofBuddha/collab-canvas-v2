/**
 * AI Agent for CollabBoard — runs on PartyKit server (Cloudflare Workers).
 *
 * Anthropic Claude with native tool use. The agent operates on a virtual
 * board state, recording shape operations for the client to apply via Yjs so
 * we never round-trip every step over the wire.
 *
 * Tool design for visual composition:
 *   - composeArtifact: primary creation tool. The model submits *all* shapes
 *     for one artifact (e.g. a firetruck) in a single call, names it, and the
 *     server emits a single group of N create operations. This avoids
 *     per-shape round-trips and guarantees grouped output.
 *   - updateShape / deleteShape: surgical refinement of existing shapes.
 *
 * We talk to Anthropic over plain fetch — the @anthropic-ai/sdk package pulls
 * in node:stream/promises via its agent-toolset entry, which won't bundle for
 * Cloudflare Workers.
 */

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'

interface TextBlock { type: 'text'; text: string }
interface ToolUseBlock { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
// Extended-thinking blocks carry the model's chain-of-thought and a signature.
// We never inspect them; we just echo them back verbatim so the next turn's
// signature validation passes.
interface ThinkingBlock { type: 'thinking'; thinking: string; signature: string }
type ContentBlock = TextBlock | ToolUseBlock | ThinkingBlock
interface AssistantContent { content: ContentBlock[]; stop_reason: string }

interface Tool {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

/** Content blocks the API accepts inside a user message. */
type UserContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_result'; tool_use_id: string; content: string }
  | { type: 'image'; source: { type: 'base64'; media_type: 'image/png' | 'image/jpeg'; data: string } }

export type MessageParam =
  | { role: 'user'; content: string | UserContentBlock[] }
  | { role: 'assistant'; content: ContentBlock[] }

// ============================================================================
// Shape / operation types (mirror client shape model)
// ============================================================================

interface ShapeData {
  id: string
  type: 'rectangle' | 'circle' | 'line' | 'text' | 'sticky' | 'polygon' | 'path'
  x: number
  y: number
  width?: number
  height?: number
  radiusX?: number
  radiusY?: number
  x2?: number
  y2?: number
  points?: number[]
  d?: string
  cornerRadius?: number
  color: string
  label?: string
  labelFontSize?: number
  labelColor?: string
  text?: string
  arrowStart?: boolean
  arrowEnd?: boolean
  strokeWidth?: number
  stroke?: string
  zIndex?: number
  groupId?: string
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
  /** Session identifier so the client can correlate review messages back to
   *  the original request. Required for the iteration loop. */
  sessionId: string
  operations: AIOperation[]
  /** Map of new groupId → human-readable name, so the client can display
   *  things like "EDITING · Fire truck" when one of these groups is selected. */
  groups?: Record<string, { name: string }>
  message: string
  /** True when the client should render the canvas to a PNG and post an
   *  ai-review message so Claude can critique its own work. */
  requestReview: boolean
  /** True when the session has wrapped — either Claude called finishedDrawing,
   *  iteration cap was hit, or there's nothing left to do. */
  done: boolean
  error?: string
}

/** Message sent by the client after applying operations: a screenshot of
 *  the canvas. Server feeds it to Claude as image input on the next turn. */
export interface AIReviewRequest {
  type: 'ai-review'
  sessionId: string
  /** Base64-encoded PNG WITHOUT the "data:image/png;base64," prefix. */
  image: string
}

// ============================================================================
// Tool schemas
// ============================================================================

// One shape spec inside a composeArtifact call. Kept liberal on coordinates
// so the model can place things wherever; required fields per type are
// described in prose in the system prompt.
const shapeSpecSchema = {
  type: 'object' as const,
  properties: {
    type: {
      type: 'string',
      enum: ['rectangle', 'circle', 'line', 'polygon', 'path'],
      description:
        'Primitive shape type. ' +
        'rectangle = boxes/bodies/buildings (use cornerRadius for soft corners). Carries text. ' +
        'circle = wheels/eyes/lights/heads/dots. Carries text. ' +
        'line = straight segment — antenna, beam, arrow shaft. ' +
        'polygon = non-rectangular outlines made of straight edges — badges, ladder rungs, irregular shapes. Provide points. Carries text. ' +
        'path = curved or organic outlines via SVG path data — hoses, smoke trails, flames, soft surfaces. Provide d, width, height. ' +
        'NOTE: there is no separate "text" or "sticky" primitive — to draw text, use a rectangle with the text fields set; for a sticky-note look, use a yellow rect with text.',
    },
    x: { type: 'number', description: 'Top-left X of the shape\'s bounding box (for circle: center X − radiusX; for line: start X).' },
    y: { type: 'number', description: 'Top-left Y of the shape\'s bounding box (for circle: center Y − radiusY; for line: start Y).' },
    width: { type: 'number', description: 'Required for rectangle, polygon, path.' },
    height: { type: 'number', description: 'Required for rectangle, polygon, path.' },
    radiusX: { type: 'number', description: 'Required for circle. Horizontal radius.' },
    radiusY: { type: 'number', description: 'Required for circle. Vertical radius (equal to radiusX for a true circle).' },
    x2: { type: 'number', description: 'Line end X (required for line).' },
    y2: { type: 'number', description: 'Line end Y (required for line).' },
    points: {
      type: 'array',
      items: { type: 'number' },
      description:
        'Polygon only. Flat array of vertex coords [x1, y1, x2, y2, ...] in the LOCAL space of the shape — that is, relative to (x, y), with values in roughly [0..width] × [0..height]. ' +
        'At least 3 points (6 numbers). Polygon is auto-closed. ' +
        'Example for a diamond: width 80, height 60, points [40, 0, 80, 30, 40, 60, 0, 30].',
    },
    d: {
      type: 'string',
      description:
        'Path only. SVG path data. Supported commands: M (move), L (line), Q (quadratic curve), C (cubic curve), Z (close). ' +
        'All coords are in the LOCAL space of the shape — values in [0..width] × [0..height]. ' +
        'Example for a curved hose: width 80, height 60, d "M 0 30 Q 40 0 80 30". ' +
        'Example for a flame: width 40, height 60, d "M 20 60 Q 0 30 20 0 Q 40 30 20 60 Z".',
    },
    color: { type: 'string', description: 'Fill color (hex, e.g. #DC2626). Pick a coherent palette across the whole artifact. For lines/paths-as-strokes, set color to "transparent" or omit fill and rely on stroke.' },
    stroke: { type: 'string', description: 'Optional outline color (hex). Use for definition on key parts.' },
    strokeWidth: { type: 'number', description: 'Outline / line stroke width in px. Default 2 for lines; 0 for shapes (no outline).' },
    text: { type: 'string', description: 'Optional display text rendered inside the shape (rect/circle/polygon). Pair with fontSize, fontFamily, textColor, align, verticalAlign. For a single-word label, just set text="WORD" — auto-centered by default.' },
    fontSize: { type: 'number', description: 'Text font size in px. Defaults to an auto-scaled value if omitted.' },
    fontFamily: { type: 'string', description: 'Text font family. Defaults to Inter. Other safe choices: Arial, Helvetica, Georgia, Times New Roman, Courier New.' },
    textColor: { type: 'string', description: 'Text fill color (hex). Defaults to #374151.' },
    align: { type: 'string', enum: ['left', 'center', 'right'], description: 'Horizontal text alignment within the shape. Default center.' },
    verticalAlign: { type: 'string', enum: ['top', 'middle', 'bottom'], description: 'Vertical text alignment within the shape. Default middle.' },
    arrowStart: { type: 'boolean', description: 'Line only: arrowhead at start.' },
    arrowEnd: { type: 'boolean', description: 'Line only: arrowhead at end.' },
    zIndex: { type: 'number', description: 'Stacking order. Declare shapes back-to-front: first shape = lowest zIndex (0), each subsequent +1.' },
    cornerRadius: { type: 'number', description: 'Rectangle only: corner radius in px (0 = sharp). Use 6-12 for soft UI panels, 16-32 for cartoon bodies, height/2 for pill shapes. Almost every cartoon/illustration rect benefits from rounded corners.' },
  },
  required: ['type', 'x', 'y', 'color'],
}

const tools: Tool[] = [
  {
    name: 'composeArtifact',
    description:
      'Create a complete visual artifact (a drawing, a diagram, a composition) as a single grouped unit. ' +
      'Submit ALL shapes for the artifact in one call — body, parts, details, all of it. ' +
      'The server creates the shapes atomically and groups them under a single named group. ' +
      'Use this for anything the user asks you to "make" or "draw": "a firetruck", "a SWOT diagram", "a cat", "a kanban board". ' +
      'Declare shapes back-to-front (largest/background first, smaller foreground details last) using zIndex 0..N-1.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: {
          type: 'string',
          description: 'Short human-readable name for the group (e.g. "Fire truck", "SWOT analysis", "Smiley face"). Shown in the UI.',
        },
        shapes: {
          type: 'array',
          description: 'Every shape in the artifact, ordered back-to-front.',
          items: shapeSpecSchema,
          minItems: 1,
          maxItems: 80,
        },
        addToGroupId: {
          type: 'string',
          description: 'Optional. If provided, the new shapes are added to this EXISTING group instead of forming a new one. Use when the user asks to extend an artifact ("add a ladder to the firetruck") and you can see the group in the current board state.',
        },
      },
      required: ['name', 'shapes'],
    },
  },
  {
    name: 'updateShape',
    description: 'Modify properties of one existing shape. Use for surgical refinements ("make the wheel bigger", "color the body blue"). Find shape IDs in the current board state.',
    input_schema: {
      type: 'object' as const,
      properties: {
        shapeId: { type: 'string', description: 'ID of the shape to update.' },
        x: { type: 'number' },
        y: { type: 'number' },
        width: { type: 'number' },
        height: { type: 'number' },
        radiusX: { type: 'number' },
        radiusY: { type: 'number' },
        x2: { type: 'number' },
        y2: { type: 'number' },
        color: { type: 'string' },
        stroke: { type: 'string' },
        strokeWidth: { type: 'number' },
        label: { type: 'string' },
        labelColor: { type: 'string' },
        labelFontSize: { type: 'number' },
        arrowStart: { type: 'boolean' },
        arrowEnd: { type: 'boolean' },
        zIndex: { type: 'number' },
      },
      required: ['shapeId'],
    },
  },
  {
    name: 'deleteShape',
    description: 'Remove one shape from the canvas.',
    input_schema: {
      type: 'object' as const,
      properties: {
        shapeId: { type: 'string', description: 'ID of the shape to delete.' },
      },
      required: ['shapeId'],
    },
  },
  {
    name: 'finishedDrawing',
    description:
      'Call when the current artifact is good enough as-is, or when you have made your final surgical refinements during a critique pass. This stops the iteration loop. ' +
      'Use this LIBERALLY during review passes — most of the time, the right move after one critique round is to call finishedDrawing rather than over-polish. ' +
      'Always call this last (after any updateShape / composeArtifact you also want to make in the same turn).',
    input_schema: {
      type: 'object' as const,
      properties: {
        score: { type: 'number', description: '1-10 self-rating of the final result. Be honest.' },
        notes: { type: 'string', description: 'One short sentence summarizing what you produced.' },
      },
    },
  },
]

// ============================================================================
// System prompt
// ============================================================================

const SYSTEM_PROMPT = `You are the AI co-creator on CollabBoard — a paint program where users and you compose visual artifacts together out of three primitives: rectangle, circle, line. The user might ask you to make anything: a firetruck, a SWOT diagram, a cat, a flowchart, a smiley face, a sailboat, a kanban board. Treat every request as a small composition problem.

# Primitives (this is everything you have)
- **rectangle**: box. Width + height. **Use cornerRadius (default 0) liberally** — almost every cartoon/illustration rect should have rounded corners (6-12 for soft, 16-32 for chunky, height/2 for a pill).
- **circle** (ellipse): radiusX + radiusY (set them equal for a true circle). Use for wheels, eyes, lights, heads, dots, badges, planets.
- **line**: from (x,y) to (x2,y2). Optional arrowheads. Use for ladders, beams, cables, paths, arrows, connectors, antennas.
- **polygon**: closed shape made of straight edges. Provide width, height, and points [x1, y1, x2, y2, ...] in LOCAL space (relative to x,y, values in 0..width × 0..height). Use for badges, ladder rungs, irregular shapes, flag pennants, stars (with many vertices), shield outlines, diamond-shaped warning signs.
- **path**: arbitrary outline including curves. Provide width, height, and d (SVG path data) in LOCAL space. Supported commands: M (move), L (line), Q (quadratic bezier), C (cubic bezier), Z (close). Use this when straight edges feel wrong — curved hoses, smoke wisps, flames, organic surfaces, smooth roof lines, wave shapes, cartoon hair, brushstrokes.

Every shape has a fill color (hex), optional stroke color + width for an outline, optional **text** (with fontSize, fontFamily, textColor, align, verticalAlign — see below), and a zIndex (stacking order). Rectangles additionally have cornerRadius. The local-coordinate convention for polygon/path keeps shapes movable — once placed, the user can drag them around without breaking the geometry.

## Text as a property
Text is a property of every shape (rect/circle/polygon), not a separate primitive. To render "FD 07" on a firetruck badge: create a rect with text="FD 07", textColor="#7F1D1D", fontSize=14. To make a sticky note: create a yellow rect with text set and align="left", verticalAlign="top". DO NOT use a "text" or "sticky" type — they are no longer in the schema.

## When to reach for polygon or path

Rectangle and circle are blocky on their own. The leap from "child's drawing" to "designer drawing" usually comes from adding one or two polygons or paths for the parts that aren't naturally rectangular. Examples:

- **Firetruck**: the body can be a rounded rectangle, but the WINDSHIELD often looks better as a polygon with a slanted top edge: width 80, height 50, points [10, 50, 0, 10, 80, 0, 80, 50]. The HOSE coiled on top should be a path with a Q curve.
- **House**: the WALLS are a rectangle. The ROOF is a polygon (triangle): width 200, height 80, points [0, 80, 100, 0, 200, 80].
- **Car**: the WINDSHIELD slants — polygon. The HOOD curves — path.
- **Tree**: the foliage clump — path with several Q curves to make a cloud-like outline.
- **Flame, smoke, hose, wave, cape, beard, feather**: path.
- **Star, gem, badge, shield, diamond, arrow body**: polygon.

If you're about to draw something that needs a slanted/curved edge and you're tempted to "approximate it with a rectangle" — STOP and use polygon or path instead. That single choice is what separates a recognizable drawing from a blocky one.

# How to think about a request

1. **Decompose first.** Before placing anything, briefly list the parts of the thing in your head. A firetruck = body, cab, two wheels, ladder, light bar, light, windows, headlights, bumper. A cat = head, two ears, two eyes, nose, mouth, whiskers, body, tail.

2. **Pick a frame.** Fit your composition inside roughly 400×400 (or wider for landscape things). Don't sprawl.
   - **Free-space placement is mandatory.** Every user message starts with a PLACEMENT line directing you to either a specific (x, y) for new artifacts or telling you to edit existing content. You MUST place new artifacts starting at the directed origin. NEVER overlap existing artifacts unless the user explicitly asks you to extend or edit them.
   - When the directive says "place at (X, Y)", that's the top-left of your composition's bounding box. Every shape you create must have x ≥ X (modulo a small natural shape offset).

3. **Pick a palette.** Choose 3-6 colors max. Use them consistently. Hex codes only. Examples:
   - Firetruck: #DC2626 (red body) · #1F2937 (tires) · #F3F4F6 (windows) · #FCD34D (light/ladder) · #374151 (outlines)
   - Cartoon style: bold flat colors + dark outlines (stroke #1F2937, strokeWidth 2-3)
   - SWOT: #BBF7D0 / #FECACA / #BFDBFE / #FDE68A (one quadrant each)

4. **Plan z-order back to front.** Declare shapes from the BACKGROUND forward. zIndex 0 = furthest back. Each next shape gets a higher zIndex. For a firetruck: zIndex 0 = body rectangle, then cab, then windows on top of cab, then wheels in front of body, then light on top.

5. **Submit it all at once.** Call composeArtifact with the full list of shapes and a name. Don't dribble shapes in one at a time.

6. **Give the group a clear name** so the user can find and manipulate it later. "Fire truck", "SWOT analysis", "Smiley face".

# Worked example: a recognizable firetruck (study this carefully)
This is the level of detail required. The model that designed this used about 18 shapes and thought hard about proportions.

Decomposition (back to front):
- Ladder shadow strip behind the body (subtle, optional)
- Red main body rectangle: long horizontal box, the chassis between the wheels
- Red cab rectangle: a smaller, taller box on the LEFT-FRONT, slightly shorter than the body, sticks up taller than the body's roofline
- Lighter-red or pink "side stripe" thin rectangle running horizontally across both body and cab at mid-height (this is the brand stripe — adds realism)
- Cab window: a square-ish white/light-blue rectangle inside the cab, upper portion
- Door outline on the cab: small darker stroked rect
- Headlight: small yellow/white circle at the front (right edge of cab, vertically centered with the body)
- Bumper: thin gray rectangle along the very front
- Two black wheel circles under the body — large, equal-sized, one near each end. Each has a smaller gray "hub cap" circle on top of it.
- Light bar on top of the cab: a thin red or yellow rectangle running across the top of the cab roof
- Two siren lights on top of the light bar: small red and blue circles
- Ladder on the back/top of the body: a yellow rectangle (the rails) with several parallel thin yellow lines across it (the rungs) sitting at a slight angle — OR use lines for the rails and lines for the rungs
- Door handle: tiny dark rect on the door
- (Optional flair) hose reel: a small dark circle on the side

Concrete coordinate sketch — a high-quality firetruck (anchor the bbox at the directed PLACEMENT origin (X, Y); below assumes (X, Y) = (400, 340)). All ~18 shapes below. zIndex back to front. **Note the mix: rect, circle, polygon, AND path — that mix is what makes it look like a firetruck instead of stacked blocks.**

- body (rounded rect for the chassis): rectangle x=400 y=400 w=340 h=80 cornerRadius=12 fill=#DC2626 stroke=#7F1D1D strokeWidth=2 zIndex=0
- cabin back wall (rectangular part of the cab): rectangle x=400 y=340 w=80 h=80 cornerRadius=10 fill=#DC2626 stroke=#7F1D1D strokeWidth=2 zIndex=1
- cabin slanted hood/windshield (POLYGON — straight slant from cab top down to body front): polygon x=480 y=340 w=60 h=80 points=[0,80, 0,30, 60,80] fill=#DC2626 stroke=#7F1D1D strokeWidth=2 zIndex=1
- cabin window (POLYGON — matches the slant): polygon x=410 y=350 w=120 h=45 points=[0,45, 0,10, 90,10, 120,45] fill=#BFDBFE stroke=#1F2937 strokeWidth=1.5 zIndex=2
- side stripe: rectangle x=400 y=440 w=340 h=10 cornerRadius=3 fill=#FCA5A5 zIndex=3
- "FD 07" badge: rectangle x=540 y=410 w=70 h=24 cornerRadius=5 fill=#FFFFFF stroke=#7F1D1D strokeWidth=1.5 text="FD 07" textColor=#7F1D1D fontSize=14 zIndex=4
- door outline: rectangle x=410 y=410 w=64 h=60 cornerRadius=4 fill="transparent" stroke=#7F1D1D strokeWidth=1.5 zIndex=4
- door handle: rectangle x=455 y=435 w=14 h=4 cornerRadius=2 fill=#374151 zIndex=5
- light bar on top of cab: rectangle x=410 y=320 w=70 h=14 cornerRadius=7 fill=#1F2937 zIndex=4
- siren red: circle cx=425 cy=327 rx=6 ry=6 fill=#EF4444 stroke=#FFFFFF strokeWidth=1 zIndex=5  (so x=419 y=321)
- siren blue: circle cx=465 cy=327 rx=6 ry=6 fill=#3B82F6 stroke=#FFFFFF strokeWidth=1 zIndex=5  (so x=459 y=321)
- ladder rails (rounded rect): rectangle x=560 y=355 w=170 h=14 cornerRadius=7 fill=#FCD34D stroke=#92400E strokeWidth=1 zIndex=3
- ladder rungs (lines across the rails): six lines from (575..720 in steps of 29) y=355 to same x, y=369, color=#92400E strokeWidth=1 zIndex=4
- hose coiled on body (PATH — quadratic curve makes it look like a curl, not a stick): path x=620 y=395 w=80 h=40 d="M 0 30 Q 20 0 40 20 Q 60 40 80 10" stroke=#1F2937 strokeWidth=4 fill="transparent" zIndex=4
- headlight: circle cx=735 cy=440 rx=8 ry=8 fill=#FEF3C7 stroke=#92400E strokeWidth=1.5 zIndex=3  (so x=727 y=432)
- bumper: rectangle x=730 y=465 w=15 h=20 cornerRadius=3 fill=#374151 zIndex=2
- front wheel: circle cx=460 cy=490 rx=30 ry=30 fill=#1F2937 stroke=#000000 strokeWidth=2 zIndex=6
- front hub (small inner circle): circle cx=460 cy=490 rx=11 ry=11 fill=#9CA3AF zIndex=7
- rear wheel: circle cx=680 cy=490 rx=30 ry=30 fill=#1F2937 stroke=#000000 strokeWidth=2 zIndex=6
- rear hub: circle cx=680 cy=490 rx=11 ry=11 fill=#9CA3AF zIndex=7

Why this works: the windshield/slant uses polygon (NOT a stack of small rectangles approximating a diagonal — that looks broken). The hose uses path with a Q curve (NOT a straight line — that wouldn't read as a hose). The body and ladder rails use cornerRadius (NOT sharp corners — those read as Lego bricks). The wheels are layered circles for the hub-cap look. The "FD 07" label is on a small rounded white rectangle for the panel.

Place the artifact at the PLACEMENT origin by shifting every x and y by (X - 400, Y - 340).

Palette: #DC2626 (truck red), #7F1D1D (deep red outline), #FCA5A5 (pink stripe), #FCD34D (ladder yellow), #92400E (dark yellow outline), #1F2937 (black/dark), #9CA3AF (silver hub), #BFDBFE (window blue), #FEF3C7 (headlight glow), #EF4444 + #3B82F6 (siren lights), #374151 (bumper).

This is the standard you should aim for on similar requests (cars, trains, boats, planes, animals, buildings). Don't just place a few blocky shapes and call it done — fill in the details that make the thing recognizable.

# Worked example: "make me a SWOT"
Four labeled rectangles in a 2×2 grid: Strengths #BBF7D0, Weaknesses #FECACA, Opportunities #BFDBFE, Threats #FDE68A. Each ~180×120, gap of ~20 between them. The 'label' property carries the section name centered in each box. One composeArtifact call, name "SWOT analysis".

# Composition quality rules
- **Leave ~10-20px between distinct parts** so nothing visually fuses unintentionally.
- **Round coordinates to multiples of 5 or 10** for clean alignment.
- **Size shapes to fit their content.** A box with a 10-character label needs ~120px width.
- **Use outlines (stroke) for cartoonish definition** — dark thin strokes (1-2px, #1F2937 or #374151) on key parts read well.
- **Symmetry matters.** Eyes, wheels, ears: place them mirrored across the center axis. Compute positions relative to the parent shape's center, not from the canvas origin.

# Placing parts INSIDE a body (faces, vehicles, etc.)
This is where most mistakes happen. When you place features on a head/body:
1. First, place the head/body shape and write down its center (cx, cy), width (w), and height (h).
2. Then compute every feature's coordinates RELATIVE to that center:
   - Eyes on a face: at (cx ± w*0.18, cy - h*0.08). They sit in the upper-middle of the face, slightly above center, symmetric left/right.
   - Nose/beak on a face: at (cx, cy + h*0.05). Centered horizontally, slightly below the eyes.
   - Mouth: at (cx, cy + h*0.25). Centered horizontally, lower portion of face.
   - Ears on a cat: at (cx ± w*0.30, cy - h*0.45). Above the head, symmetric.
3. When using x,y (top-left) coords for a feature with width fw and height fh, convert from center: x = featureCx - fw/2, y = featureCy - fh/2.
4. For a circle feature with radii rx, ry: x = featureCx - rx, y = featureCy - ry.
5. Sanity check before submitting: does feature.x + feature.width/2 ≈ targetCx? If not, you made an arithmetic mistake.

Skip this math and you get eyes on the chin and beaks on the forehead. Don't skip it.

# Refining existing work
If the user references something already on the canvas (you'll see the current shapes listed at the start of each turn), use updateShape or deleteShape to modify in place. If they say "add a hose to the firetruck", call composeArtifact again with the new parts and pass addToGroupId = the firetruck's groupId (visible in the board state).

# How to respond
- Don't narrate before you call tools — go straight to composeArtifact.
- After tool use, give a one-sentence summary of what you made.
- If the user's request is ambiguous, make a reasonable choice and ship it — they can iterate.

# Self-review pass (when you receive an image of the canvas)
After your initial draw, you may receive a follow-up user message containing an IMAGE of the current canvas plus a critique prompt. When that happens:
1. **Look at the image honestly.** Score it 1-10 as a recognizable [the thing the user asked for].
2. **If score ≥ 7**: call \`finishedDrawing\` immediately. No edits. Don't over-polish.
3. **If 1-3 surgical fixes would clearly help** (a wheel is too small; an eye is in the wrong spot; a color is wrong): call updateShape/deleteShape/composeArtifact for ONLY those fixes, then call \`finishedDrawing\`.
4. **If it's fundamentally broken** (totally unrecognizable): call \`finishedDrawing\` anyway. Don't redo from scratch — let the user re-prompt.
5. **Never** add 10+ new shapes during a review pass. That's a sign you're starting over, which the user didn't ask for.
6. Use the shape IDs visible in the board summary (e.g. \`ai-temp-N\`) to target your updates/deletes.`

// ============================================================================
// Agent runner
// ============================================================================

// Opus 4.7 + adaptive thinking is the configuration that approaches the
// quality bar Claude Design hits — the model gets to deeply plan layouts
// (decomposition, symmetry math, z-order) before placing any shape.
// Opus 4.7 uses the newer thinking API: type=adaptive + output_config.effort.
const MODEL = 'claude-opus-4-7'
const THINKING_EFFORT = 'high'
const MAX_TOOL_ROUNDS = 6
// Leave plenty of room: extended thinking + a single big composeArtifact call
// with 30-60 shapes can easily fill 8k tokens.
const MAX_TOKENS = 20000

/** Per-turn run result. The session-level fields (messages, originalPrompt)
 *  are kept on the AISession in party/index.ts so this module stays stateless. */
export interface AIRunResult {
  operations: AIOperation[]
  groups: Record<string, { name: string }>
  message: string
  /** True if the model called finishedDrawing during this turn. */
  finished: boolean
  /** Updated message history including the model's tool-use turn(s). Caller
   *  persists this on the session to feed into the next turn. */
  messages: MessageParam[]
  error?: string
}

export interface AIRunOptions {
  apiKey: string
  currentShapes: ShapeData[]
  /** For the first turn of a session — builds the initial user message. */
  initial?: { prompt: string }
  /** For a follow-up review turn — appends a critique message with the image. */
  review?: { priorMessages: MessageParam[]; imageBase64: string; artifactName: string; iteration: number }
}

export async function runAIAgent(opts: AIRunOptions): Promise<AIRunResult> {
  const { apiKey, currentShapes } = opts
  const operations: AIOperation[] = []
  const virtualShapes: ShapeData[] = [...currentShapes]
  const groups: Record<string, { name: string }> = {}
  let tempIdCounter = 0
  let tempGroupCounter = 0
  let finished = false

  function newTempId(): string {
    return `ai-temp-${++tempIdCounter}`
  }
  function newGroupId(): string {
    return `ai-grp-${Date.now()}-${++tempGroupCounter}`
  }

  function executeTool(name: string, args: Record<string, unknown>): string {
    switch (name) {
      case 'composeArtifact': {
        const groupName = (args.name as string) || 'Untitled'
        const addTo = args.addToGroupId as string | undefined
        const groupId = addTo || newGroupId()
        // Record the (possibly new) group's name so the client can display it.
        if (!addTo) groups[groupId] = { name: groupName }
        const inputShapes = (args.shapes as Record<string, unknown>[]) || []
        const createdIds: string[] = []
        for (const spec of inputShapes) {
          const tempId = newTempId()
          const shape: Partial<ShapeData> & { type: ShapeData['type'] } = {
            type: spec.type as ShapeData['type'],
            x: spec.x as number,
            y: spec.y as number,
            color: (spec.color as string) || '#D1D5DB',
            groupId,
          }
          for (const key of ['width', 'height', 'radiusX', 'radiusY', 'x2', 'y2',
            'points', 'd', 'cornerRadius',
            'text', 'fontSize', 'fontFamily', 'textColor', 'align', 'verticalAlign',
            'label', 'labelFontSize', 'labelColor', 'stroke', 'strokeWidth',
            'arrowStart', 'arrowEnd', 'zIndex']) {
            if (spec[key] !== undefined) {
              (shape as Record<string, unknown>)[key] = spec[key]
            }
          }
          operations.push({ action: 'create', shape })
          virtualShapes.push({ id: tempId, ...shape } as ShapeData)
          createdIds.push(tempId)
        }
        return JSON.stringify({
          success: true,
          groupId,
          groupName,
          shapeIds: createdIds,
          count: createdIds.length,
        })
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

      case 'finishedDrawing': {
        finished = true
        const score = args.score as number | undefined
        const notes = args.notes as string | undefined
        return JSON.stringify({ acknowledged: true, score, notes })
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` })
    }
  }

  // Build the running message history for this turn. For an initial request,
  // we start fresh with the prompt. For a review, we extend the prior history
  // with a new user turn containing the canvas image plus a critique prompt.
  let messages: MessageParam[]
  if (opts.initial) {
    const boardSummary = summarizeBoard(currentShapes)
    const placement = derivePlacement(currentShapes, opts.initial.prompt)
    messages = [
      {
        role: 'user',
        content: `${placement}\n\n${boardSummary}\n\nUser request: ${opts.initial.prompt}`,
      },
    ]
  } else if (opts.review) {
    const { priorMessages, imageBase64, artifactName, iteration } = opts.review
    const boardSummary = summarizeBoard(currentShapes)
    messages = [
      ...priorMessages,
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: imageBase64 },
          },
          {
            type: 'text',
            text:
              `Here is the current canvas after your last turn. Critique it honestly as a "${artifactName}".\n\n` +
              `${boardSummary}\n\n` +
              `Review pass ${iteration}/3. Follow the self-review rules in the system prompt. ` +
              `Default action: call finishedDrawing. Only edit if there's a clear 1-3-fix improvement.`,
          },
        ],
      },
    ]
  } else {
    return {
      operations: [],
      groups: {},
      message: '',
      finished: true,
      messages: [],
      error: 'runAIAgent called without initial or review options.',
    }
  }

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const httpResponse = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          thinking: {
            type: 'adaptive',
          },
          output_config: {
            effort: THINKING_EFFORT,
          },
          // Cache the system prompt + tool schemas — they're identical across
          // every request so this slashes per-call token cost.
          system: [{
            type: 'text',
            text: SYSTEM_PROMPT,
            cache_control: { type: 'ephemeral' },
          }],
          tools,
          messages,
        }),
      })

      if (!httpResponse.ok) {
        const errBody = await httpResponse.text()
        console.error('[ai] Anthropic call failed', {
          status: httpResponse.status,
          statusText: httpResponse.statusText,
          keyFingerprint: `${apiKey.slice(0, 8)}…${apiKey.slice(-4)} (len=${apiKey.length})`,
          anthropicVersion: ANTHROPIC_VERSION,
          model: MODEL,
          body: errBody.slice(0, 500),
        })
        return {
          operations,
          groups,
          message: '',
          finished: true,
          messages,
          error: `Anthropic API ${httpResponse.status}: ${errBody.slice(0, 500)}`,
        }
      }

      const response = await httpResponse.json() as AssistantContent
      messages.push({ role: 'assistant', content: response.content })

      const toolUses: ToolUseBlock[] = response.content.filter(
        (b): b is ToolUseBlock => b.type === 'tool_use',
      )

      // No tool calls = model is done with this turn.
      if (toolUses.length === 0 || response.stop_reason === 'end_turn') {
        const textBlocks = response.content.filter(b => b.type === 'text')
        const message = textBlocks.map(b => (b as TextBlock).text).join('\n').trim()
        return {
          operations,
          groups,
          message: message || 'Done.',
          finished,
          messages,
        }
      }

      const toolResults = toolUses.map(tu => ({
        type: 'tool_result' as const,
        tool_use_id: tu.id,
        content: executeTool(tu.name, tu.input),
      }))
      messages.push({ role: 'user', content: toolResults })

      // If the model called finishedDrawing mid-turn, we still want to run
      // any other tools it called in the same response, but stop iterating
      // further once they're processed.
      if (finished && toolUses.every(tu => tu.name === 'finishedDrawing')) {
        const textBlocks = response.content.filter(b => b.type === 'text')
        const message = textBlocks.map(b => (b as TextBlock).text).join('\n').trim()
        return {
          operations,
          groups,
          message: message || 'Done.',
          finished: true,
          messages,
        }
      }
    }

    return {
      operations,
      groups,
      message: 'Done (reached step limit).',
      finished: true,
      messages,
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    return {
      operations: [],
      groups: {},
      message: '',
      finished: true,
      messages,
      error: `AI agent error: ${errorMessage}`,
    }
  }
}

/**
 * Compact textual description of the board state for the model. Groups
 * shapes by groupId so the model thinks in artifacts, not individual atoms.
 */
/**
 * Build the PLACEMENT directive that prefaces every prompt. If the prompt
 * sounds like a refinement (mentions add/extend/edit/change) AND there's at
 * least one group on the board, suggest editing existing content. Otherwise
 * direct the model to a specific free-space origin computed from the board's
 * bounding box. This is the load-bearing fix for "every prompt overlaps".
 */
function derivePlacement(shapes: ShapeData[], prompt: string): string {
  const wantsEdit = /\b(add|extend|edit|change|update|modify|tweak|fix|recolor|move|delete|remove|to the (firetruck|truck|cat|diagram|chart|board))/i.test(prompt)
  if (shapes.length === 0) {
    return `PLACEMENT: Empty canvas. Place your new artifact starting near (400, 300).`
  }
  const bbox = boundingBox(shapes)
  if (!bbox) {
    return `PLACEMENT: Place your new artifact starting near (400, 300).`
  }
  if (wantsEdit) {
    return `PLACEMENT: The user appears to be referring to existing content. If so, use updateShape/deleteShape or composeArtifact with addToGroupId pointing at the relevant group. If you decide this is actually a new artifact request, place it starting at (${Math.round(bbox.maxX + 80)}, ${Math.round(bbox.minY)}) so it doesn't overlap.`
  }
  const originX = Math.round(bbox.maxX + 80)
  const originY = Math.round(bbox.minY)
  return `PLACEMENT: Place your new artifact starting at (${originX}, ${originY}). This is empty space to the right of all existing content. DO NOT overlap existing shapes.`
}

function summarizeBoard(shapes: ShapeData[]): string {
  if (shapes.length === 0) {
    return 'Empty canvas. Suggested origin for new artifact: (400, 300).'
  }

  const grouped = new Map<string, ShapeData[]>()
  const ungrouped: ShapeData[] = []
  for (const s of shapes) {
    if (s.groupId) {
      const arr = grouped.get(s.groupId) ?? []
      arr.push(s)
      grouped.set(s.groupId, arr)
    } else {
      ungrouped.push(s)
    }
  }

  const lines: string[] = [`Canvas has ${shapes.length} shape(s).`]

  // Compute overall bounding box and suggest a free origin to the right of
  // existing content so back-to-back prompts don't pile artifacts on top of
  // each other.
  const bbox = boundingBox(shapes)
  if (bbox) {
    lines.push(`Existing content bbox: x ${Math.round(bbox.minX)}..${Math.round(bbox.maxX)}, y ${Math.round(bbox.minY)}..${Math.round(bbox.maxY)}.`)
    const suggestedX = Math.round(bbox.maxX + 80)
    const suggestedY = Math.round(bbox.minY)
    lines.push(`Suggested origin for a NEW artifact (in free space to the right): (${suggestedX}, ${suggestedY}). Use this unless the user asked you to edit existing content.`)
  }

  if (grouped.size > 0) {
    lines.push('Groups:')
    for (const [gid, gshapes] of grouped) {
      const firstLabel = gshapes.find(s => s.label)?.label
      const typeCounts = countByType(gshapes)
      const summary = firstLabel ? `"${firstLabel}"` : typeCounts
      lines.push(`- groupId=${gid} (${gshapes.length} shapes, ${summary})`)
      for (const s of gshapes.slice(0, 12)) {
        lines.push(`    ${shapeLine(s)}`)
      }
      if (gshapes.length > 12) lines.push(`    ... (+${gshapes.length - 12} more)`)
    }
  }

  if (ungrouped.length > 0) {
    lines.push('Ungrouped shapes:')
    for (const s of ungrouped.slice(0, 20)) {
      lines.push(`- ${shapeLine(s)}`)
    }
    if (ungrouped.length > 20) lines.push(`... (+${ungrouped.length - 20} more)`)
  }

  return lines.join('\n')
}

/** AABB across all shapes; null if there are none. */
function boundingBox(shapes: ShapeData[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (shapes.length === 0) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const s of shapes) {
    const b = shapeAABB(s)
    if (b.x < minX) minX = b.x
    if (b.y < minY) minY = b.y
    if (b.x + b.w > maxX) maxX = b.x + b.w
    if (b.y + b.h > maxY) maxY = b.y + b.h
  }
  return { minX, minY, maxX, maxY }
}

function shapeAABB(s: ShapeData): { x: number; y: number; w: number; h: number } {
  switch (s.type) {
    case 'rectangle':
    case 'text':
    case 'sticky':
      return { x: s.x, y: s.y, w: s.width ?? 0, h: s.height ?? 0 }
    case 'circle':
      return { x: s.x, y: s.y, w: (s.radiusX ?? 0) * 2, h: (s.radiusY ?? 0) * 2 }
    case 'line': {
      const minLX = Math.min(s.x, s.x2 ?? s.x)
      const minLY = Math.min(s.y, s.y2 ?? s.y)
      const maxLX = Math.max(s.x, s.x2 ?? s.x)
      const maxLY = Math.max(s.y, s.y2 ?? s.y)
      return { x: minLX, y: minLY, w: maxLX - minLX, h: maxLY - minLY }
    }
    default:
      return { x: s.x, y: s.y, w: 0, h: 0 }
  }
}

function shapeLine(s: ShapeData): string {
  const props: string[] = [`id=${s.id}`, `type=${s.type}`, `x=${Math.round(s.x)}`, `y=${Math.round(s.y)}`]
  if (s.width !== undefined) props.push(`w=${Math.round(s.width)}`)
  if (s.height !== undefined) props.push(`h=${Math.round(s.height)}`)
  if (s.radiusX !== undefined) props.push(`rx=${Math.round(s.radiusX)}`)
  if (s.radiusY !== undefined) props.push(`ry=${Math.round(s.radiusY)}`)
  if (s.color) props.push(`color=${s.color}`)
  if (s.label) props.push(`label="${s.label}"`)
  return props.join(' ')
}

function countByType(shapes: ShapeData[]): string {
  const counts: Record<string, number> = {}
  for (const s of shapes) counts[s.type] = (counts[s.type] ?? 0) + 1
  return Object.entries(counts).map(([t, n]) => `${n} ${t}`).join(' + ')
}
