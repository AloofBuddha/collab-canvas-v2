# Plan: Shape Primitives + AI Agent

## Goal

Upgrade shape primitives so an AI agent can generate professional-looking boards from natural language. The AI evaluation criteria drive what we build:

| Command | Expected Output | Primitives Needed |
|---------|----------------|-------------------|
| "Create a SWOT analysis" | 4 labeled quadrants (Strengths, Weaknesses, Opportunities, Threats) | Labeled rectangles, precise positioning |
| "Arrange in a grid" | Elements aligned with consistent spacing | Batch shape updates, position math |
| Multi-step commands | AI plans steps and executes sequentially | Tool-use agent with shape CRUD |

## Analysis: What's Missing

### Current shapes can't express labeled diagrams
A SWOT analysis needs 4 colored rectangles, each with a title. Today you'd need 4 rectangles + 4 separate text shapes positioned on top — fragile, ugly, and impossible for an AI to reliably produce.

**Fix: Add `label` to BaseShape.** Any shape can display centered text. One shape = one visual unit. The AI creates `{ type: 'rectangle', label: 'Strengths', color: '#BBF7D0', ... }` and it just works.

### Lines can't show direction
Current `line` is a bare stroke with no arrowheads. For flowcharts and diagrams, arrows show direction/flow.

**Fix: Add `arrowStart`/`arrowEnd` booleans to LineShape.** Konva has a built-in `Arrow` component — swap `Line` for `Arrow` when either flag is true. Low effort, big payoff.

### No connectors (deferred)
True connectors (lines that track attached shapes) are complex: anchor calculation, re-routing on move, handling deleted targets. For the sprint, arrows + precise AI positioning are sufficient. The AI can create arrow shapes at the right coordinates. Connectors are a post-sprint enhancement.

### No frames/groups (deferred)
Frames that visually contain children are useful but not required for eval criteria. SWOT can be done with 4 adjacent rectangles. Deferred.

---

## Implementation Plan

### Step 1: Add `label` to BaseShape
**Files:** `types/index.ts`, `ShapeRenderer.tsx`, `shapeFactory.ts`

Types:
```ts
interface BaseShape {
  // ... existing fields
  label?: string
  labelFontSize?: number
  labelColor?: string
}
```

Rendering (in ShapeRenderer.tsx):
- After rendering the shape fill, render a `<KonvaText>` centered in the shape's bounds
- Use `label`, `labelFontSize` (default: auto-scale based on shape size, capped at 24px), `labelColor` (default: dark gray)
- Apply to rectangle, circle, sticky (text shape already has its own text system)
- Label is read-only (no inline editing for labels — that's what text/sticky shapes are for)

Factory:
- No change to default creation (labels are optional)
- `createShape` already passes through all props

Tests:
- Add label rendering tests to shapeFactory tests
- Verify getBounds/getDimensions are unaffected by label

### Step 2: Add arrow support to lines
**Files:** `types/index.ts`, `ShapeRenderer.tsx`

Types:
```ts
interface LineShape extends BaseShape {
  // ... existing fields
  arrowStart?: boolean
  arrowEnd?: boolean
}
```

Rendering:
- Import Konva `Arrow` component
- When `arrowEnd` or `arrowStart` is true, render `<Arrow>` instead of `<Line>`
- Arrow pointer size: `10 * strokeWidth / 4` (scales with stroke)
- Konva Arrow supports `pointerAtBeginning` for start arrows

Factory:
- Default `arrowEnd: false`, `arrowStart: false`
- No change to creation UX (arrows are set via toolbar or AI)

Toolbar:
- Optional: add arrow toggle buttons to FloatingToolbar when a line is selected
- Can be deferred — AI sets these programmatically

### Step 3: Add label support to FloatingToolbar
**Files:** `FloatingToolbar.tsx`, `FloatingToolbar.module.css`

- When a rectangle/circle is selected, show a "Label" text input in the floating toolbar
- Editing the input calls `updateShape(id, { label: value })`
- Keep it simple — single-line input, no rich text

### Step 4: AI Agent service
**Files:** `src/services/aiAgent.ts` (new), `src/hooks/useAIAgent.ts` (new)

Architecture:
- LangChain agent with tool-use (Claude API)
- Tools the AI can call:
  - `createShape(type, props)` — create a shape with full control over position, size, color, label
  - `updateShape(id, props)` — modify an existing shape
  - `deleteShape(id)` — remove a shape
  - `listShapes()` — get current board state (so AI can reason about what exists)
  - `arrangeShapes(shapeIds, layout)` — helper for grid/row/column arrangements
- Agent receives the current board state as context
- Multi-step: LangChain agent loop handles sequential tool calls naturally

### Step 5: AI Chat UI
**Files:** `src/components/AIChat.tsx` (new), `src/components/AIChat.module.css` (new)

- Bottom-right chat panel (collapsible)
- Text input + send button
- Message history (user messages + AI responses)
- Shows "thinking" indicator during AI processing
- AI responses include what actions were taken ("Created 4 rectangles for SWOT analysis")

### Step 6: Wire AI to canvas
**Files:** `CanvasPage.tsx`, `useBoard.ts`

- AI agent calls go through the same `addShape`/`updateShape`/`removeShape` as user actions
- This means AI actions sync via Yjs to all clients automatically
- AI actions go through UndoManager so user can Ctrl+Z to undo AI changes

---

## SWOT Analysis Example

What the AI should produce for "Create a SWOT analysis":

```
┌─────────────────┬─────────────────┐
│   Strengths     │   Weaknesses    │
│   (#BBF7D0)     │   (#FECACA)     │
│                 │                 │
├─────────────────┼─────────────────┤
│  Opportunities  │    Threats      │
│   (#BFDBFE)     │   (#FDE68A)     │
│                 │                 │
└─────────────────┴─────────────────┘
```

AI tool calls:
1. `createShape('rectangle', { x: 100, y: 100, width: 300, height: 250, color: '#BBF7D0', label: 'Strengths' })`
2. `createShape('rectangle', { x: 400, y: 100, width: 300, height: 250, color: '#FECACA', label: 'Weaknesses' })`
3. `createShape('rectangle', { x: 100, y: 350, width: 300, height: 250, color: '#BFDBFE', label: 'Opportunities' })`
4. `createShape('rectangle', { x: 400, y: 350, width: 300, height: 250, color: '#FDE68A', label: 'Threats' })`

With labels on BaseShape, this is 4 simple tool calls. Without labels, it would be 8 shapes (4 rects + 4 texts) with fragile positioning.

---

## Priority Order

1. **Labels on shapes** (Step 1) — highest leverage, unlocks all labeled-diagram use cases
2. **Arrow support** (Step 2) — quick win, makes lines useful for diagrams
3. **AI agent service** (Step 4) — core AI functionality
4. **AI chat UI** (Step 5) — user-facing interface
5. **Wire to canvas** (Step 6) — integration
6. **Toolbar label editing** (Step 3) — nice-to-have for manual use

Steps 1-2 are shape primitive work (half day). Steps 4-6 are AI agent work (1-2 days).

---

## Open Questions

- **API key management**: Where does the Anthropic API key live? Options:
  - PartyKit server-side (keeps key secret, AI calls go through WebSocket)
  - Vercel serverless function (separate API endpoint)
  - Client-side with user-provided key (simplest but exposes key)
- **AI model**: Claude Sonnet for speed vs Opus for quality? Sonnet is probably fine for SWOT-level tasks.
- **Rate limiting**: Should we throttle AI calls per user? Probably not for MVP.
- **Error handling**: What does the AI show when it fails? Simple error message in chat.
