# CollabBoard V2

A collaborative whiteboard with real-time multiplayer sync and AI-assisted board generation. Think Miro, but with an AI agent that can create and arrange shapes from natural language commands.

**Live:** [collab-canvas-ben-cohen.vercel.app](https://collab-canvas-ben-cohen.vercel.app)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript + Vite |
| Canvas | react-konva (Konva.js) |
| Real-time sync | Yjs (CRDT) + PartyServer (WebSocket, Durable Objects) |
| Auth | Firebase Auth (email/password + Google sign-in) |
| Styling | CSS Modules (no Tailwind) |
| Deployment | Vercel (frontend) + Cloudflare Workers (PartyServer) |
| AI | Anthropic Claude API via LangChain (planned) |

## Architecture

```
User action → Yjs Y.Map.set() → CRDT auto-sync via PartyServer WebSocket
→ Y.Map.observe() fires on all clients → React state update → re-render
```

The core data layer is a Yjs document per board. Shapes live in a `Y.Map<Shape>` — no intermediate state store (no Zustand/Redux for shapes). The `useBoard` hook owns the Yjs lifecycle and exposes shapes + CRUD operations to React.

A Cloudflare Worker running [PartyServer](https://github.com/cloudflare/partykit) hosts one Durable Object per board, which relays Yjs updates and persists the doc to Durable Object storage. The frontend connects via `y-partyserver`, which handles sync, awareness (cursors/presence), and reconnection.

### Key Design Decisions

- **No server-side board listing** — Durable Objects can't be listed per user. Board metadata (title, ownership, last visited) is tracked in localStorage. Yjs stores the canonical board title so all clients see the same name.
- **Full-viewport canvas** — The Konva Stage is `position: fixed; top: 0` filling the entire viewport. The Header overlays on top with `z-index`. This avoids offset math for mouse coordinates.
- **CSS Modules only** — All component styles use CSS Modules with shared design tokens (CSS custom properties in `index.css`). No utility-class frameworks.
- **CRDT conflict resolution** — Yjs handles concurrent edits at the CRDT level (last-writer-wins per shape). No manual conflict resolution needed.

## Features

### Canvas
- **5 shape types**: rectangle, circle, line, text, sticky note
- **Shape manipulation**: create (click-drag), select, drag-move, resize (8-point handles), delete
- **Text editing**: double-click text/sticky shapes for inline WYSIWYG editing
- **Pan & zoom**: middle-click drag, space+drag to pan; Ctrl+wheel to zoom; Ctrl+0 to reset
- **Keyboard shortcuts**: Delete, Ctrl+D duplicate, arrow nudge, Escape deselect, Ctrl+Z/Y undo/redo, `]`/`[` layer ordering
- **Floating toolbar**: fill/stroke color, stroke width, opacity, layer ordering, delete — appears on shape selection
- **Undo/redo**: Yjs UndoManager tracks local changes; remote changes excluded

### Multiplayer
- **Real-time shape sync** across all connected clients
- **Remote cursors** with user name labels and per-user colors
- **Presence indicators** in the header (online user avatars)
- **Per-room color assignment** with conflict resolution

### Dashboard
- **Board listing** with owned vs. recently visited sections
- **Create board modal** with custom naming
- **Board title sync** via Yjs (creator sets title, all clients see it)

### Auth
- Email/password sign-up and sign-in
- Google sign-in (popup flow)
- Auth gate — unauthenticated users see login page

## Project Structure

```
src/
├── components/          # React components
│   ├── CanvasPage.tsx   # Main canvas view (Stage, shapes, tools)
│   ├── ShapeRenderer.tsx # Konva shape rendering + selection/resize handles
│   ├── Dashboard.tsx    # Board listing and creation
│   ├── Header.tsx       # Top bar with breadcrumb, presence, sign out
│   ├── FloatingToolbar.tsx # Context toolbar for selected shapes
│   ├── Toolbar.tsx      # Left-side tool selector
│   └── ...
├── hooks/
│   ├── useBoard.ts      # Core Yjs hook — shapes, cursors, CRUD, undo/redo
│   ├── useCanvasPanning.ts
│   ├── useCanvasZoom.ts
│   ├── useKeyboardShortcuts.ts
│   ├── useShapeCreation.ts
│   ├── useShapeDragging.ts
│   └── useShapeResize.ts
├── utils/
│   ├── shapeFactory.ts  # Shape type registry — creation, bounds, normalization
│   ├── shapeManipulation.ts # Resize, drag, dimension calculations
│   ├── boardStorage.ts  # localStorage board tracking (owned/visited)
│   ├── auth.ts          # Firebase Auth wrappers
│   └── ...
├── types/index.ts       # Shape, User, Cursor type definitions
└── party/index.ts       # PartyServer worker (Yjs relay + AI agent); config in wrangler.jsonc
```

## Development

```bash
# Install dependencies
npm install

# Start frontend dev server
npm run dev

# Start PartyServer dev server on :1999 (separate terminal)
npm run dev:party

# Deploy the worker (set the AI key once: npx wrangler secret put ANTHROPIC_API_KEY)
npm run deploy:party

# Run unit tests
npm test

# Run e2e tests (requires dev servers running)
npm run test:e2e

# Type check
npx tsc --noEmit

# Lint
npm run lint

# Build for production
npm run build
```

### Environment Variables

Copy `.env.template` to `.env` and fill in:

```
VITE_PARTY_HOST=localhost:1999      # or the deployed *.workers.dev host
VITE_FIREBASE_*                     # Firebase config values
```

## Test Suite

- **81 unit tests** across 6 files (vitest + jsdom)
  - `boardStorage` (18) — CRUD, ownership split, migration, title sync
  - `shapeManipulation` (35) — resize, drag, dimension calculations
  - `shapeFactory` (11) — creation, bounds, normalization
  - `validation` (6) — input validation
  - `throttle` (7) — throttle utility
  - `userColors` (4) — color assignment
- **Playwright e2e tests** — auth flows (7) + canvas interactions (9)
