/**
 * CanvasPage - Main canvas orchestration component
 *
 * Rewritten for V2: wires useBoard (Yjs), pan/zoom, shape creation, dragging,
 * and multi-select (drag-to-select, shift+click, Ctrl+A, group drag).
 */

import { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Stage, Layer } from 'react-konva'
import Konva from 'konva'
import { useBoard } from '../hooks/useBoard'
import { useCanvasPanning } from '../hooks/useCanvasPanning'
import { useCanvasZoom } from '../hooks/useCanvasZoom'
import { useShapeCreation } from '../hooks/useShapeCreation'
import { usePenCreation } from '../hooks/usePenCreation'
import { usePenStrokeCreation } from '../hooks/usePenStrokeCreation'
import { useShapeDragging } from '../hooks/useShapeDragging'
import { useShapeResize } from '../hooks/useShapeResize'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import { useMultiSelect } from '../hooks/useMultiSelect'
import ShapeRenderer, { NewShapeRenderer } from './ShapeRenderer'
import { DragSelectRect, MultiSelectBounds } from './SelectionOverlay'
import PenPreview from './PenPreview'
import DimensionLabel from './DimensionLabel'
import RemoteCursor from './RemoteCursor'
import GridBackground from './GridBackground'
import Toolbar from './Toolbar'
import UndoRedoButtons from './UndoRedoButtons'
import FloatingToolbar from './FloatingToolbar'
import SidePanel from './SidePanel'
import InlineTextEditor from './InlineTextEditor'
import ZoomControls from './ZoomControls'
import Header from './Header'
import AIBar, { type AIBarHandle } from './AIBar'
import KeyboardShortcutsGuide from './KeyboardShortcutsGuide'
import { useAIChat } from '../hooks/useAIChat'
import { getCursorStyle } from '../utils/canvasUtils'
import { getPointerPosition } from '../utils/shapeManipulation'
import type { Tool, Shape, User, TextShape, StickyNoteShape } from '../types'
import { signOut } from '../utils/auth'
import { getBoards, addBoard, visitBoard, updateBoardTitle } from '../utils/boardStorage'

interface CanvasPageProps {
  user: User
}

export function CanvasPage({ user }: CanvasPageProps) {
  const { boardId } = useParams<{ boardId: string }>()
  const navigate = useNavigate()
  const stageRef = useRef<Konva.Stage>(null)
  const [tool, setTool] = useState<Tool>('select')
  const [stageScale, setStageScale] = useState(1)
  const [windowSize, setWindowSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  })
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 })
  const [editingShapeId, setEditingShapeId] = useState<string | null>(null)
  const [showShortcutsGuide, setShowShortcutsGuide] = useState(false)
  const aiBarRef = useRef<AIBarHandle>(null)

  // Look up known board metadata from localStorage
  const boardMeta = useMemo(() => {
    return getBoards().find((b) => b.id === boardId)
  }, [boardId])

  // Core Yjs hook — shapes, cursors, CRUD, board title
  const {
    shapes,
    remoteCursors,
    onlineUsers,
    localColor,
    boardTitle: yjsBoardTitle,
    updateCursor,
    addShape,
    updateShape,
    removeShape,
    undo,
    redo,
    canUndo,
    canRedo,
    bringToFront,
    sendToBack,
    bringForward,
    sendBackward,
    groupShapes,
    ungroupShapes,
  } = useBoard(boardId!, user, boardMeta?.title)

  // AI Chat
  const { isLoading: aiLoading, sendMessage: aiSend, history: aiHistory, groupNames } = useAIChat(
    boardId!, user.userId, shapes, addShape, updateShape, removeShape,
  )

  // Displayed title: Yjs is the source of truth, localStorage is fallback
  const displayTitle = yjsBoardTitle ?? boardMeta?.title ?? 'Untitled Board'

  // Multi-select
  const {
    selectedShapeIds,
    selectedShapeId,
    selectionBox,
    isSelecting,
    handleShapeClick,
    handleStageClick,
    selectAll,
    deselectAll,
    selectShape,
    startSelection,
    updateSelection,
    finishSelection,
    cancelSelection,
    setSelectedShapeIds,
  } = useMultiSelect()

  // Pan & Zoom
  const { isPanning, setIsPanning } = useCanvasPanning({ stageRef })
  const { handleWheel: baseHandleWheel } = useCanvasZoom({ onScaleChange: setStageScale })

  // Resolve the name of the selected AI artifact (if any). Drives refine
  // mode in the AI bar. Placed after multi-select so we can read its state.
  const selectedArtifactName = useMemo(() => {
    if (selectedShapeIds.size === 0) return null
    const gids = new Set<string>()
    for (const id of selectedShapeIds) {
      const g = shapes[id]?.groupId
      if (g) gids.add(g)
      else return null // any ungrouped shape disqualifies refine mode
    }
    if (gids.size !== 1) return null
    const gid = Array.from(gids)[0]
    return groupNames[gid] ?? null
  }, [selectedShapeIds, shapes, groupNames])

  // True when every selected shape belongs to the same group — used to
  // suppress per-shape selection borders so the group reads as one unit.
  const isGroupedSelection = useMemo(() => {
    if (selectedShapeIds.size < 2) return false
    let groupId: string | undefined
    for (const id of selectedShapeIds) {
      const g = shapes[id]?.groupId
      if (!g) return false
      if (groupId === undefined) groupId = g
      else if (groupId !== g) return false
    }
    return true
  }, [selectedShapeIds, shapes])

  // Wrap wheel handler to also track stage position
  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    baseHandleWheel(e)
    const stage = e.target.getStage()
    if (stage) setStagePos(stage.position())
  }, [baseHandleWheel])

  // Reset zoom to 100% and center
  const resetZoom = useCallback(() => {
    const stage = stageRef.current
    if (!stage) return
    stage.scale({ x: 1, y: 1 })
    stage.position({ x: 0, y: 0 })
    setStageScale(1)
    setStagePos({ x: 0, y: 0 })
  }, [])

  // Shape creation (click-drag) — used by every tool EXCEPT path.
  const { isDrawing, newShape, startCreating, updateSize, finishCreating } = useShapeCreation({
    userId: user.userId,
    onShapeCreated: addShape,
    onToolChange: setTool,
    // path + pen are handled by their dedicated hooks; useShapeCreation
    // only owns drag-based primitives, so substitute a safe fallback type.
    shapeType: (tool === 'select' || tool === 'path' || tool === 'pen') ? 'rectangle' : tool,
  })

  // Pen creation — used by the path tool. Click adds a vertex; preview line
  // follows cursor; double-click (or Enter / Escape) finishes / cancels.
  const {
    isPenning,
    points: penPoints,
    previewPoint: penPreviewPoint,
    addPoint: addPenPoint,
    updatePreview: updatePenPreview,
    finishPen,
    cancelPen,
  } = usePenCreation({
    userId: user.userId,
    onShapeCreated: addShape,
    onToolChange: setTool,
  })

  // Freehand strokes — used by the pen tool. Mousedown begins, mousemove
  // samples, mouseup commits as a path shape.
  const {
    isStroking,
    points: strokePoints,
    startStroke,
    addStrokeSample,
    finishStroke,
    cancelStroke,
  } = usePenStrokeCreation({
    userId: user.userId,
    onShapeCreated: addShape,
    onToolChange: setTool,
  })

  // Shape dragging (with Alt+Drag duplication and multi-shape group drag)
  const { handleDragStart, handleDragMove, handleDragEnd } = useShapeDragging({
    isPanning,
    updateShape,
    addShape,
    setSelectedShapeId: (id: string | null) => { if (id) selectShape(id) },
    selectedShapeIds,
    shapes,
  })

  // Shape resizing
  const {
    tryStartResize,
    handleResizeMove,
    handleResizeEnd,
    isResizing,
    getHandleCursor,
  } = useShapeResize({ shapes, updateShape, stageScale })

  // Sorted shapes for rendering (by zIndex)
  const sortedShapes = useMemo(() => {
    return Object.values(shapes).sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
  }, [shapes])

  // Selected shapes array for multi-select bounding box
  const selectedShapes = useMemo(() => {
    return Array.from(selectedShapeIds)
      .map(id => shapes[id])
      .filter(Boolean)
  }, [selectedShapeIds, shapes])

  // Track board visit in localStorage
  useEffect(() => {
    if (!boardId) return
    if (boardMeta) {
      visitBoard(boardId)
    } else {
      addBoard(boardId, 'Untitled Board', false)
    }
  }, [boardId, boardMeta])

  // When the Yjs title arrives, sync it back to localStorage
  useEffect(() => {
    if (boardId && yjsBoardTitle) {
      updateBoardTitle(boardId, yjsBoardTitle)
    }
  }, [boardId, yjsBoardTitle])

  // Window resize
  useEffect(() => {
    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      })
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Pen-tool: Enter to commit, Escape to cancel. Registered here so it can
  // see the pen hook's `isPenning` and bypass the general shortcuts hook.
  useEffect(() => {
    if (!isPenning && !isStroking) return
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
      if (e.key === 'Enter' && isPenning) {
        e.preventDefault()
        finishPen()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        if (isPenning) cancelPen()
        if (isStroking) cancelStroke()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isPenning, isStroking, finishPen, cancelPen, cancelStroke])

  // Keyboard shortcuts
  useKeyboardShortcuts({
    shapes,
    selectedShapeIds,
    selectedShapeId,
    deselectAll,
    selectAll,
    setSelectedShapeIds,
    setTool,
    addShape,
    updateShape,
    removeShape,
    undo,
    redo,
    bringToFront,
    sendToBack,
    bringForward,
    sendBackward,
    groupShapes,
    ungroupShapes,
    resetZoom,
    onToggleShortcutsGuide: () => setShowShortcutsGuide(prev => !prev),
    onToggleAI: () => aiBarRef.current?.focus(),
  })

  // Cursor style
  const cursorStyle = getCursorStyle(isPanning, isDrawing, tool)

  // --- Mouse handlers ---

  const handleMouseDown = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    const evt = e.evt

    // Middle-click → pan
    if (evt.button === 1) {
      setIsPanning(true)
      return
    }

    // Left-click only
    if (evt.button !== 0) return

    if (tool === 'path') {
      // Pen flow: each click adds a vertex. Double-click ends the path.
      const stage = e.target.getStage()
      if (!stage) return
      const pos = getPointerPosition(stage)
      if (pos) addPenPoint(pos.x, pos.y)
      return
    }

    if (tool === 'pen') {
      // Freehand stroke begins
      const stage = e.target.getStage()
      if (!stage) return
      const pos = getPointerPosition(stage)
      if (pos) startStroke(pos.x, pos.y)
      return
    }

    if (tool !== 'select') {
      // Shape creation tool active → start drawing (drag-based)
      startCreating(e)
    } else {
      // Select tool — clicked on empty canvas
      const clickedOnStage = e.target === e.target.getStage()
      if (clickedOnStage) {
        const stage = e.target.getStage()
        if (!stage) return

        // Rotation zones live OUTSIDE the shape bounds, so a click there
        // hits the Stage. If something is single-selected, try rotate/resize
        // first; only fall through to drag-to-select if we missed.
        if (selectedShapeId && selectedShapeIds.size === 1) {
          if (tryStartResize(stage, selectedShapeId)) {
            e.cancelBubble = true
            return
          }
        }

        // Otherwise start drag-to-select
        const pos = getPointerPosition(stage)
        if (pos) {
          handleStageClick() // deselect first
          startSelection(pos.x, pos.y)
        }
      }
    }
  }, [tool, startCreating, setIsPanning, handleStageClick, startSelection, selectedShapeId, selectedShapeIds.size, tryStartResize, addPenPoint, startStroke])

  const handleMouseMove = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    // Update cursor position for remote presence
    const stage = e.target.getStage()
    if (stage) {
      const pos = getPointerPosition(stage)
      if (pos) {
        updateCursor({ x: pos.x, y: pos.y })
      }

      // If actively resizing, update shape dimensions
      if (isResizing()) {
        handleResizeMove(stage)
        return
      }

      // Update drag-to-select box
      if (isSelecting && pos) {
        updateSelection(pos.x, pos.y)
        return
      }

      // Update cursor style when hovering over resize handles of selected shape
      if (selectedShapeId && tool === 'select' && !isDrawing && !isPanning) {
        const handleCursor = getHandleCursor(stage, selectedShapeId)
        const container = stage.container()
        if (handleCursor) {
          container.style.cursor = handleCursor
        } else {
          container.style.cursor = cursorStyle
        }
      }
    }

    // Update shape creation preview
    if (isDrawing) {
      updateSize(e)
    }

    // Update pen-tool preview (rubber-band from last vertex to cursor)
    if (isPenning) {
      const stage = e.target.getStage()
      if (stage) {
        const pos = getPointerPosition(stage)
        if (pos) updatePenPreview(pos.x, pos.y)
      }
    }

    // Freehand stroke sampling
    if (isStroking) {
      const stage = e.target.getStage()
      if (stage) {
        const pos = getPointerPosition(stage)
        if (pos) addStrokeSample(pos.x, pos.y)
      }
    }
  }, [updateCursor, isDrawing, updateSize, isResizing, handleResizeMove, isSelecting, updateSelection, selectedShapeId, tool, isPanning, isPenning, isStroking, getHandleCursor, cursorStyle, updatePenPreview, addStrokeSample])

  const handleMouseUp = useCallback(() => {
    if (isResizing()) {
      handleResizeEnd()
      return
    }
    if (isStroking) {
      finishStroke()
      return
    }
    if (isSelecting) {
      finishSelection(shapes)
      return
    }
    if (isDrawing) {
      finishCreating()
    }
  }, [isDrawing, finishCreating, isResizing, handleResizeEnd, isSelecting, finishSelection, shapes, isStroking, finishStroke])

  // Shape-level event handlers
  const handleShapeMouseDown = useCallback((e: Konva.KonvaEventObject<MouseEvent>, shapeId: string) => {
    // Cancel any active drag-selection
    if (isSelecting) {
      cancelSelection()
    }

    // Shift+click = toggle multi-select; normal click = single select.
    // Pass shapes so the hook can expand the selection to sibling group members.
    handleShapeClick(shapeId, e.evt.shiftKey, shapes)

    // If shape is already selected (single select), check if clicking on a resize handle
    const stage = e.target.getStage()
    if (stage && shapeId === selectedShapeId && selectedShapeIds.size === 1) {
      const started = tryStartResize(stage, shapeId)
      if (started) {
        e.target.stopDrag()
        e.cancelBubble = true
      }
    }
  }, [shapes, selectedShapeId, selectedShapeIds.size, tryStartResize, handleShapeClick, isSelecting, cancelSelection])

  const handleShapeDragStart = useCallback((e: Konva.KonvaEventObject<DragEvent>, shape: Shape) => {
    handleDragStart(e, shape)
  }, [handleDragStart])

  const handleShapeDragMove = useCallback((e: Konva.KonvaEventObject<DragEvent>, shape: Shape) => {
    handleDragMove(e, shape)

    // Also update cursor position during drag
    const stage = e.target.getStage()
    if (stage) {
      const pos = getPointerPosition(stage)
      if (pos) updateCursor({ x: pos.x, y: pos.y })
    }
  }, [handleDragMove, updateCursor])

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleShapeDragEnd = useCallback((_shape: Shape) => {
    handleDragEnd()
  }, [handleDragEnd])

  // --- Group drag for multi-select ---
  // Snapshot every selected shape's original position at drag start so the
  // per-frame handler can compute `original + totalDelta`. The previous
  // implementation read `shapes` from the closure, which is stale until the
  // Yjs update round-trips back through React — causing the bbox to visually
  // outrun the shapes during fast drags.
  interface GroupDragOrigin {
    nodeX: number
    nodeY: number
    shapes: Array<{ id: string; x: number; y: number; x2?: number; y2?: number }>
  }
  const groupDragOriginRef = useRef<GroupDragOrigin | null>(null)

  const handleGroupDragStart = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    const node = e.target
    groupDragOriginRef.current = {
      nodeX: node.x(),
      nodeY: node.y(),
      shapes: Array.from(selectedShapeIds)
        .map(id => shapes[id])
        .filter((s): s is Shape => !!s)
        .map(s => ({
          id: s.id,
          x: s.x,
          y: s.y,
          x2: s.type === 'line' ? s.x2 : undefined,
          y2: s.type === 'line' ? s.y2 : undefined,
        })),
    }
  }, [selectedShapeIds, shapes])

  const handleGroupDragMove = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    const origin = groupDragOriginRef.current
    if (!origin) return
    const node = e.target
    const totalDeltaX = node.x() - origin.nodeX
    const totalDeltaY = node.y() - origin.nodeY

    for (const orig of origin.shapes) {
      const updates: Partial<Shape> = {
        x: orig.x + totalDeltaX,
        y: orig.y + totalDeltaY,
      }
      if (orig.x2 !== undefined && orig.y2 !== undefined) {
        (updates as Record<string, number>).x2 = orig.x2 + totalDeltaX;
        (updates as Record<string, number>).y2 = orig.y2 + totalDeltaY
      }
      updateShape(orig.id, updates)
    }
  }, [updateShape])

  const handleGroupDragEnd = useCallback(() => {
    groupDragOriginRef.current = null
  }, [])

  // Double-click to edit text/sticky inline
  const handleDoubleClick = useCallback((shapeId: string) => {
    const shape = shapes[shapeId]
    if (shape && (shape.type === 'text' || shape.type === 'sticky')) {
      setEditingShapeId(shapeId)
    }
  }, [shapes])

  const handleTextSave = useCallback((text: string) => {
    if (editingShapeId) {
      updateShape(editingShapeId, { text } as Partial<Shape>)
    }
    setEditingShapeId(null)
  }, [editingShapeId, updateShape])

  const handleTextCancel = useCallback(() => {
    setEditingShapeId(null)
  }, [])

  // Sync stage position after panning ends
  useEffect(() => {
    if (!isPanning && stageRef.current) {
      setStagePos(stageRef.current.position())
    }
  }, [isPanning])

  // Apply cursor to stage container
  useEffect(() => {
    if (stageRef.current) {
      const container = stageRef.current.container()
      if (container) container.style.cursor = cursorStyle
    }
  }, [cursorStyle])

  return (
    <>
      <Header
        displayName={user.displayName}
        color={localColor}
        onlineUsers={onlineUsers}
        currentUserId={user.userId}
        onSignOut={signOut}
        boardTitle={displayTitle}
        onNavigateHome={() => navigate('/')}
      />
      <Stage
        ref={stageRef}
        width={windowSize.width}
        height={windowSize.height}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        onDblClick={() => { if (isPenning) finishPen() }}
        style={{ position: 'fixed', top: 0, left: 0 }}
      >
        {/* Grid background */}
        <GridBackground
          width={windowSize.width}
          height={windowSize.height}
          scale={stageScale}
          offsetX={stagePos.x}
          offsetY={stagePos.y}
        />

        {/* Main shapes layer */}
        <Layer>
          {sortedShapes.map((shape) => (
            <ShapeRenderer
              key={shape.id}
              shape={shape}
              isSelected={selectedShapeIds.has(shape.id)}
              showHandles={selectedShapeIds.size === 1}
              /* For grouped selections, suppress per-shape selection borders —
                 the outer MultiSelectBounds rectangle stands in. Multi-select
                 of ungrouped shapes keeps per-shape borders so the user can
                 see which individual shapes are in the set. */
              showBorder={!isGroupedSelection || selectedShapeIds.size === 1}
              isEditing={shape.id === editingShapeId}
              stageScale={stageScale}
              onMouseDown={handleShapeMouseDown}
              onDragStart={handleShapeDragStart}
              onDragMove={handleShapeDragMove}
              onDragEnd={handleShapeDragEnd}
              onDoubleClick={handleDoubleClick}
            />
          ))}

          {/* Multi-select bounding box with group drag */}
          <MultiSelectBounds
            shapes={selectedShapes}
            stageScale={stageScale}
            onGroupDragStart={handleGroupDragStart}
            onGroupDragMove={handleGroupDragMove}
            onGroupDragEnd={handleGroupDragEnd}
          />

          {/* Dimension label for single-selected shape */}
          {selectedShapeId && shapes[selectedShapeId] && !editingShapeId && (
            <DimensionLabel
              shape={shapes[selectedShapeId]}
              stageScale={stageScale}
            />
          )}

          {/* Drag-to-select rectangle */}
          {isSelecting && selectionBox && (
            <DragSelectRect box={selectionBox} stageScale={stageScale} />
          )}

          {/* Creation preview */}
          {isDrawing && newShape && <NewShapeRenderer shape={newShape} />}

          {/* Pen (vertex-based) preview */}
          {isPenning && (
            <PenPreview
              points={penPoints}
              previewPoint={penPreviewPoint}
              stageScale={stageScale}
            />
          )}

          {/* Freehand stroke preview — no per-vertex dots; the samples
              aren't meaningful as individual decisions. */}
          {isStroking && (
            <PenPreview
              points={strokePoints}
              previewPoint={null}
              stageScale={stageScale}
              showDots={false}
            />
          )}

          {/* Remote cursors */}
          {remoteCursors.map((cursor) => (
            <RemoteCursor
              key={cursor.userId}
              cursor={cursor}
              stageScale={stageScale}
            />
          ))}
        </Layer>
      </Stage>
      <Toolbar
        selectedTool={tool}
        onSelectTool={setTool}
      />
      <UndoRedoButtons onUndo={undo} onRedo={redo} canUndo={canUndo} canRedo={canRedo} />
      <ZoomControls scale={stageScale} onResetZoom={resetZoom} />
      {selectedShapes.length > 0 && !editingShapeId && (
        <FloatingToolbar
          selectedShapes={selectedShapes}
          stageScale={stageScale}
          stagePos={stagePos}
          addShape={addShape}
          removeShape={removeShape}
          bringToFront={bringToFront}
          sendToBack={sendToBack}
          bringForward={bringForward}
          sendBackward={sendBackward}
          groupShapes={groupShapes}
          ungroupShapes={ungroupShapes}
          setSelectedShapeIds={setSelectedShapeIds}
          onDeselect={deselectAll}
        />
      )}
      {selectedShapeIds.size === 1 && selectedShapeId && shapes[selectedShapeId] && !editingShapeId && (
        <SidePanel
          shape={shapes[selectedShapeId]}
          onUpdate={updateShape}
          onClose={deselectAll}
        />
      )}
      {editingShapeId && shapes[editingShapeId] && (
        <InlineTextEditor
          shape={shapes[editingShapeId] as TextShape | StickyNoteShape}
          stageScale={stageScale}
          stagePos={stagePos}
          onSave={handleTextSave}
          onCancel={handleTextCancel}
        />
      )}
      {showShortcutsGuide && (
        <KeyboardShortcutsGuide onClose={() => setShowShortcutsGuide(false)} />
      )}
      <AIBar
        ref={aiBarRef}
        isLoading={aiLoading}
        history={aiHistory}
        selectedArtifactName={selectedArtifactName}
        onSubmit={(prompt, opts) => aiSend(prompt, opts)}
      />
    </>
  )
}
