# Why our firetruck is awful (and Claude Design's is great)

> Independent diagnostic written 2026-05-24 after multiple rounds of primitive
> expansion + prompt engineering failed to close the visible quality gap with
> Claude Design's firetruck. Aim: name the actual bottleneck, then list
> remediations ranked by leverage.

## TL;DR

We are not bottlenecked by primitives anymore. We have rectangle (with
cornerRadius), circle, line, polygon (with `sides` for regular N-gons and
arbitrary `points` for irregular), and path (full SVG path data: M/L/Q/C/Z).
That set is functionally close to what Claude Design uses.

We are **bottlenecked by the absence of a vision iteration loop.** Claude
Design's process — readable in the transcript at
`/tmp/cc-design/collabcanvas/chats/chat1.md` — is:

1. Write a draft of the artifact (often 700+ lines of JSX)
2. Render it to a screenshot via `show_html` + `save_screenshot`
3. **Look at the image** via `view_image`
4. Critique what's broken — "the firetruck isn't rendering visibly", "found
   the bug — CSS animations without forwards fill-mode"
5. Fix and re-render
6. Repeat until it looks right

Our agent does step 1 and then stops. It never sees what it made. It is
**drawing with its eyes closed.**

Every other gap is real but secondary to this. With a vision loop, even our
current primitives would produce dramatically better output because the
model could notice "the windshield is in the wrong place" and fix it. Without
a vision loop, even a perfect primitive set produces best-guess output that
the model has no way to evaluate.

## The other gaps, in order

### Vision iteration loop *(big leverage, medium effort)*

**What it is:** after the agent's composeArtifact call applies, render the
result to a PNG on the server (or in a hidden client canvas + send back),
feed it to Claude as a vision input, let the model critique + propose
fixups (updateShape / deleteShape / extend with more composeArtifact calls).

**Why it's the biggest lever:** the model goes from "guessing" to "seeing".
This is the difference between writing code in a notepad and writing in an
IDE with live preview.

**Implementation sketch:**
- Server-side render: Konva supports `Konva.Stage.toDataURL()` in node via
  konva-node. Render the canvas state to a PNG.
- Send back as the next user-turn content with `{type: 'image', source: {…}}`.
- New user message: "Here is what you produced. Does it look like a recognizable
  firetruck? List 3 specific things you'd fix, then call the appropriate
  tools to fix them."
- 1-3 iterations is probably the sweet spot. Each iteration is one Anthropic
  round-trip; total prompt latency goes from ~20s to ~60-90s but quality
  jumps.

**Risk:** server-side Konva render on Cloudflare Workers is non-trivial.
Workers don't support full Node Canvas. Alternative: render in a hidden
client canvas and send back to the server via the WebSocket. That keeps
the heavy lifting in the browser where Konva already runs.

### Tool-call verbosity *(medium leverage, medium effort)*

**The problem:** every shape in composeArtifact requires a structured JSON
object. 30 shapes ≈ 30 small JSON blobs. Token-wise that's heavy, and
attention-wise the model has to keep track of 30 schemas in flight.

Claude Design writes one big SVG string; the model authors freely and
the parser handles the rest. Our agent has to be more deliberate.

**Remediation:** accept a `svg: string` field as an alternative to a shapes
array. Parse the SVG into our shape format on the server. The model can
pick the format that suits the task — SVG for big complex drawings, shapes
array for simple compositions or for editing existing artifacts.

**Risk:** SVG parsing is nontrivial and lots of edge cases. Maybe start
with a constrained SVG subset (the same M/L/Q/C/Z + basic primitives).

### No few-shot example as actual JSON *(small leverage, small effort)*

**The problem:** the firetruck worked example in the system prompt is in
prose-pseudocode. The model has to mentally translate "rectangle x=420
y=380 w=320 h=80 cornerRadius=12 fill=#DC2626" into a JSON shape spec
for the composeArtifact tool. That's friction.

**Remediation:** include a literal JSON `composeArtifact` invocation as
the worked example. Model can pattern-match directly.

### No gradients or shadows *(medium leverage, small effort)*

**The problem:** Konva supports linear and radial gradients (`fillLinearGradientColorStops`,
etc.) and shadows (`shadowColor`, `shadowBlur`). Our shape spec doesn't
expose them. Claude Design uses these all the time for depth and shading.

**Remediation:** add `gradient?: {type:'linear'|'radial', stops:[...], from, to}`
and `shadow?: {color, blur, offsetX, offsetY}` to the shape spec. Wire
through renderer + AI schema.

### Thinking budget vs output *(small leverage, trivial effort)*

**Current:** thinking=10k, max_tokens=20k. Output token cap for the
composeArtifact call eats into both.

**Remediation:** try thinking=20k for high-complexity drawings (firetruck,
cat). May need a separate "ambitious" code path triggered on prompts that
sound generative.

## What I am NOT proposing

- **More primitives.** We have enough. Star, arc, regular polygon, etc.
  are all just specializations of path/polygon. The model isn't choking on
  primitive coverage.
- **Switching to a different model.** Opus 4.7 + thinking is plausibly
  ceiling for current Claude. Vision-iterating is what unlocks the next tier.
- **More prompt engineering on the worked example.** We've iterated on this
  prompt three times. The marginal returns are tiny. The issue isn't that
  the model doesn't know what a firetruck looks like — it's that it can't
  see what it drew.

## Recommended order

1. **Vision iteration loop** (browser-rendered, sent back over WebSocket) —
   single biggest unlock. Build a minimal version: after the agent finishes,
   render canvas to PNG client-side, send back, ask the model "score this
   1-10 as a {artifact_name} and propose 0-3 surgical fixes". Apply fixes.
2. **Literal JSON few-shot example** — replace the prose worked example with
   one real composeArtifact JSON call. Cheap. Cuts model translation cost.
3. **Gradients + shadows** — adds the visual polish that takes things from
   "flat cartoon" to "rendered illustration".
4. **(Optional) SVG-string alternative tool** — only if (1) doesn't close
   the gap enough.

## Honest take

The user has been right at every turn that something foundational was off.
The thing they intuited as "our primitives aren't good enough" was partially
true (we did need polygon + path + cornerRadius) but the deeper issue is
that **a sighted agent vastly outperforms a blind one, regardless of tool
sophistication.** Until our agent can see what it made, we are leaving the
biggest single source of quality on the table.
