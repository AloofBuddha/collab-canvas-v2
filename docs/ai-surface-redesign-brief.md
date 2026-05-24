# Brief: AI-collaborative paint program

> Working brief for redesigning **CollabCanvas** with an AI agent as a first-class
> co-creator. Kept in-repo so we sharpen it as we learn. Once stable, this is
> what gets pasted into a fresh Claude Design session.

## What we're building (one paragraph)

CollabCanvas is a **paint program for ideas and pictures** — an infinite,
multiplayer canvas where users compose visual artifacts out of a tiny
vocabulary of shapes. The defining behavior: a user types **"make me a
firetruck"** (or a SWOT diagram, or a cat, or a flowchart) and an AI
co-creator paints it out of primitives, grouped and editable. The AI is a
peer on the canvas — visible, present, iterative — not a hidden Ctrl-K
command. Users and the AI work the way two designers would at a whiteboard:
each placing, moving, restyling, refining.

Today: React + Konva, Yjs CRDT for real-time multiplayer sync, browser
client, PartyKit server (Cloudflare Workers) hosting the AI agent (Anthropic
Claude with tool use). Existing visual language is light/minimal — white
surfaces, subtle shadows, soft pastel shape fills, lucide-react icons.

## The primitive model (decided)

Three primitives, each text-bearing:

1. **Rectangle** — fill, optional border, optional text inside (full
   typography: font, size, color, alignment).
2. **Circle / ellipse** — same.
3. **Line** — straight, optional arrowheads.

Gone from earlier drafts: ~~separate Text and Sticky primitives~~. Text is
now a property of every shape. Sticky becomes a creation **preset** (yellow
rect + centered text).

Why this matters for the AI: fewer ambiguous prompts, simpler tool schemas,
compositions that decompose cleanly. To draw a firetruck the AI thinks in
rectangles, circles, and lines — not in "should I use a labeled circle or a
circle + text shape?"

## Groups are first-class

A **group** is a composition that behaves as one unit:

- Click any member → whole group selects.
- Drag any member → whole group moves; bounding box stays anchored.
- Resize group bounding box → every member scales proportionally.
- Layer ops → whole group moves in z-order.
- Visual: single dashed outline around the group; no internal handles.
- **Critically: when the AI produces an artifact, it groups its output
  automatically** and names the group (e.g. "Fire truck", "Q4 roadmap").
  The user can then move/recolor/resize the firetruck as one thing, or
  ungroup to tweak individual parts.

## What the AI needs to do well

The hardest case is **"make me a firetruck"** — decomposing a visual concept
into 20-50 primitives, ordered back-to-front, positioned within a frame,
colored coherently, then grouped. The easy case is **"make me a SWOT"** —
known composition pattern. The system needs to handle both fluidly.

Implications:
- AI needs **batch shape creation** (one tool call, N shapes) — not one
  round-trip per shape.
- AI needs to **plan parts before placing them** (decomposition prompting,
  optional scratchpad).
- AI needs to **think in z-layers** (back-to-front declaration).
- AI needs to **return a group**, always, with a name.
- Users need an **iteration loop**: "now make it more cartoony", "add a
  hose", "color it blue" — each refinement re-edits the existing group
  rather than starting over.

## The AI surface (this is the design question)

Today: a small `Ctrl+K` toggleable command input. Functional but feels like a
power-user feature, not a co-creator.

### The feeling we want

- The AI is *visibly present*, like another teammate's cursor.
- Users casually toss it work ("make me a firetruck", "add a ladder", "make
  the body taller") the way they'd ask a coworker.
- Manual tools (left toolbar) stay equally prominent — users keep full agency.
- AI work arrives as a **named, grouped artifact** the user can immediately
  manipulate as a unit.
- The user can iterate: select the AI's artifact and say "make it bigger" or
  "give it a siren" and the AI edits in place.

### Existing UI elements that must keep working

- **Left toolbar** (vertical, ~60px) — shape creation tools (rect, circle, line).
- **Top header** (64px) — board title, breadcrumb, online users, undo/redo.
- **Right side panel** (320px, when 1 shape or 1 group selected) — property
  editor.
- **Floating action bar** (above any selection ≥ 1) — layer order, group /
  ungroup, duplicate, delete.
- **Bottom-right zoom controls**.
- **Other users' colored cursors** floating around.

### Affordances to design

1. **A persistent AI surface** — where does the prompt live? What does it
   look like at rest, while typing, while the AI is "thinking", and while
   it's painting shapes? Should it have a fixed home, or appear
   contextually (e.g., near the current selection when iterating)?

2. **AI presence on the canvas while working** — does the AI have its own
   colored cursor like a user? Its own avatar in the user list? Do shape
   outlines "stream in" so the user feels the AI painting?

3. **Iteration on an existing artifact** — when the user selects an AI
   artifact and says "add a hose" or "make it bigger", how does the prompt
   surface know to scope to that selection? Is there a different input
   state for "create new" vs "edit selected"?

4. **Refinement controls** — should there be quick affordances after the AI
   finishes ("try again", "make it bolder", "more detailed", "less
   detailed") without typing? Pre-canned chips?

5. **Conversation history** — does the AI remember prior prompts in the
   session, so the user can say "make another one but blue"?

6. **Templates / quick prompts** — slash commands? Suggestion pills?
   Sample prompts when the canvas is empty?

7. **Undo just the AI's last action** — global undo works but the user
   often wants to specifically undo what the AI just did without losing
   their own intervening edits.

### Constraints

- Desktop-first single-page web app (mobile is later).
- Canvas is the hero — chrome must stay out of the way until needed.
- Keep the existing visual language (white surfaces, soft pastels, lucide
  icons, ~3px blue focus rings).
- The AI must *join* the multiplayer cursor / avatar paradigm, not break it.
- The user should be able to use the entire app without typing in the AI
  prompt — manual tools have parity.

## Deliverables we want from Claude Design

- **2–3 distinct directions** for the AI surface. Each direction should have
  a point of view about:
  - Where the prompt lives (always-visible bar? floating? contextual?)
  - How the AI is *present* on the canvas during work
  - How users iterate on AI artifacts vs. start fresh
  - How the "make me a firetruck" first-prompt-on-empty-canvas moment feels
- For each direction: annotated wireframe/sketch + one paragraph rationale
  + the tradeoff being made.
- **Recommendation** of which to prototype first and why.
- Bonus: a take on the **failure cases** — what does the surface look like
  when the AI produces something weird/broken? When the prompt is
  ambiguous? When the user disagrees with the result?

## Iteration log

- **2026-05-24** — initial draft after first-pass redesign (SidePanel,
  FloatingToolbar split, Anthropic swap).
- **2026-05-24 (rev 2)** — Locked unified primitive model. Groups promoted
  to first-class. Reframed as "AI-collaborative paint program".
- **2026-05-24 (rev 3)** — Sharpened the headline use case to
  **"make me a firetruck"** — generative composition of arbitrary visual
  concepts, not just templated diagrams. Surfaced iteration loop as
  central to the UX. Added explicit AI-side requirements (batch creation,
  decomposition, auto-grouping, z-order discipline) that the surface
  design needs to assume as table stakes.
