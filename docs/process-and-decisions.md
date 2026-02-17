# CollabBoard V2 — Process, Decisions & Essential Patterns

## Development Process

### How We Work
- **Human = Architect/PM**, **Claude = Lead Engineer**
- High-level direction → autonomous execution → self-verify → present for review
- Verification loop: `tsc` → `eslint` → `vitest` → build → present summary
- Incremental changes, one logical concern at a time
- Git commits are atomic and descriptive (verb-first, explain "why")

### Quality Bar
- All code must pass `tsc --noEmit`, `eslint`, and `vitest run` before review
- Tests encode real understanding, not coverage numbers
- Every test file has comments explaining *why* each test exists
- Prefer 3 clear lines over 1 clever line (Kernighan/Ritchie principle)

---

## Architectural Decisions

### 1. Yjs + PartyKit over Firebase RTDB
**Why:** V1 used Firebase Realtime Database for shape sync. This created problems:
- Manual conflict resolution on concurrent edits
- Firebase SDK is heavy (~200KB)
- Vendor lock-in on data layer

**V2 decision:** Yjs CRDT handles conflicts automatically. PartyKit runs on Cloudflare edge (low latency, free tier). The Yjs document *is* the source of truth — no intermediate state store needed.

**Pattern:** `useBoard` hook creates a `Y.Doc` + `YPartyKitProvider` per board. Shapes live in `doc.getMap<Shape>("shapes")`. Board metadata lives in `doc.getMap<string>("boardMeta")`. React state syncs via `Y.Map.observe()`.

### 2. No Zustand/Redux for shapes
**Why:** Yjs Y.Map already provides reactive state + persistence + sync. Adding Zustand would mean keeping two sources of truth in sync — a recipe for bugs.

**Pattern:** `useBoard` returns `shapes` (plain `Record<string, Shape>`) and CRUD functions (`addShape`, `updateShape`, `removeShape`). Components read shapes directly. Mutations go through `Y.Map.set()` which triggers observe → setState → re-render on all clients.

### 3. CSS Modules + Design Tokens (no Tailwind)
**Why:** User preference. CSS Modules provide scoped styles without the mental overhead of utility classes. Design tokens (CSS custom properties) ensure consistency.

**Pattern:** Shared tokens in `src/index.css`:
```css
:root {
  --color-gray-100: #f3f4f6;
  --shadow-panel: 0 4px 6px -1px rgba(0, 0, 0, 0.1), ...;
  --border-color: #e5e7eb;
  --toolbar-button-size: 2.5rem;
}
```
Components use `var(--color-gray-100)` instead of hardcoded hex values.

### 4. Full-viewport Stage
**Why:** Originally the Stage was offset below the Header, requiring `HEADER_HEIGHT` math everywhere (mouse coords, toolbar positioning, grid background). Moving Stage to `position: fixed; top: 0` with Header overlaying eliminated an entire class of offset bugs.

**Pattern:** Stage fills viewport. Header has `position: fixed; z-index: 20`. Toolbar panels use `z-index: 10`. Mouse coordinates use `stage.getPointerPosition()` (world-space transform).

### 5. localStorage for board listing
**Why:** PartyKit rooms are ephemeral — there's no server-side API to list all rooms. We need *some* way to show "your boards" on the dashboard.

**Pattern:** `boardStorage.ts` stores `BoardMeta[]` in localStorage under `collabboard-boards`. Each entry has `id`, `title`, `ownedByMe`, `lastVisitedAt`. Board title is also stored in Yjs `boardMeta` map — localStorage is the fallback, Yjs is the source of truth. When Yjs syncs a title, it updates localStorage.

### 6. Shape type registry pattern
**Why:** Adding a new shape type shouldn't require editing 10 files. The registry centralizes shape-specific logic (default props, bounds calculation, normalization).

**Pattern:** `shapeFactory.ts` has a `shapeTypeRegistry` object mapping type strings to `ShapeTypeConfig`. Each config provides: `getDefaultProps`, `updateCreationProps`, `getDimensions`, `getCenter`, `getBounds`, `normalize`, etc. The public API (`createShape`, `getShapeBounds`, etc.) delegates to the registry.

**Limitation:** `ShapeRenderer.tsx` still has a `switch` statement per type for Konva rendering. This is acceptable because rendering is inherently type-specific (different Konva components per shape).

---

## Essential Patterns

### Shape Lifecycle
```
Tool selected → mousedown (startCreating) → mousemove (updateSize) → mouseup (finishCreating)
→ shape added to Y.Map → observe fires → React re-renders all clients
```

### Resize
- 8 handles: 4 corners + 4 edge midpoints
- Resize is calculated in `useShapeResize.ts` using `shapeManipulation.ts`
- Handles are rendered in local coordinate space (centered on shape)
- Handle size is inverse-scaled by `stageScale` so they stay constant size on screen

### Undo/Redo
- `UndoManager` from Yjs tracks the local client's changes to the shapes Y.Map
- Remote changes from other users are automatically excluded
- `canUndo`/`canRedo` state drives button enabled/disabled visual state

### Awareness (Cursors + Presence)
- Each client sets awareness state: `{ userId, displayName, color, cursor }`
- `useBoard` observes awareness changes and derives `remoteCursors` + `onlineUsers`
- Colors assigned per-room using `userColors.ts` (8 distinct colors, collision-resistant)
- StrictMode double-mount handled by deduplicating on Firebase UID

### Board Title Sync
- Creator passes `initialTitle` to `useBoard`
- On first Yjs sync, if `boardMeta.get("title")` is empty, creator sets it (first-writer-wins)
- All clients observe `boardMeta` for title changes
- Title synced back to localStorage for dashboard display

---

## File Map (key files)

| File | Purpose |
|------|---------|
| `src/types/index.ts` | Shape, User, Cursor type definitions |
| `src/hooks/useBoard.ts` | Core Yjs hook — shapes, cursors, CRUD, undo/redo, board title |
| `src/utils/shapeFactory.ts` | Shape type registry — creation, bounds, normalization |
| `src/utils/shapeManipulation.ts` | Resize handle math, drag position updates |
| `src/components/ShapeRenderer.tsx` | Konva rendering for all shape types + selection handles |
| `src/components/CanvasPage.tsx` | Main canvas — mouse handlers, tool state, wiring |
| `src/components/FloatingToolbar.tsx` | Context toolbar for selected shapes |
| `src/components/Dashboard.tsx` | Board listing (owned + visited) |
| `src/utils/boardStorage.ts` | localStorage board metadata CRUD |
| `src/utils/auth.ts` | Firebase Auth wrappers |
| `party/index.ts` | PartyKit server (Yjs WebSocket relay) |

---

## V1 → V2 Migration Notes

What was ported from V1 and what changed:

| Concern | V1 | V2 |
|---------|----|----|
| Shape sync | Firebase RTDB | Yjs Y.Map + PartyKit |
| State management | Zustand | Direct Yjs (no store) |
| Auth | Firebase Auth | Firebase Auth (same) |
| Styling | Tailwind | CSS Modules |
| Canvas | react-konva | react-konva (same) |
| Undo/redo | Custom stack | Yjs UndoManager |
| Board listing | Firestore collection | localStorage |
| Conflict resolution | Manual last-write-wins | CRDT automatic |
