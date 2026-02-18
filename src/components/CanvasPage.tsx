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
import { useShapeDragging } from '../hooks/useShapeDragging'
import { useShapeResize } from '../hooks/useShapeResize'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import { useMultiSelect } from '../hooks/useMultiSelect'
import ShapeRenderer, { NewShapeRenderer } from './ShapeRenderer'
import { DragSelectRect, MultiSelectBounds } from './SelectionOverlay'
import DimensionLabel from './DimensionLabel'
import RemoteCursor from './RemoteCursor'
import GridBackground from './GridBackground'
import Toolbar from './Toolbar'
import UndoRedoButtons from './UndoRedoButtons'
import FloatingToolbar from './FloatingToolbar'
import InlineTextEditor from './InlineTextEditor'
import ZoomControls from './ZoomControls'
import Header from './Header'
import AICommandInput from './AICommandInput'
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
  const [showAIInput, setShowAIInput] = useState(false)

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
  } = useBoard(boardId!, user, boardMeta?.title)

  // AI Chat
  const { isLoading: aiLoading, sendMessage: aiSend } = useAIChat(
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

  // Shape creation (click-drag)
  const { isDrawing, newShape, startCreating, updateSize, finishCreating } = useShapeCreation({
    userId: user.userId,
    onShapeCreated: addShape,
    onToolChange: setTool,
    shapeType: tool === 'select' ? 'rectangle' : tool,
  })

  // Shape dragging (with Alt+Drag duplication)
  const { handleDragStart, handleDragMove, handleDragEnd } = useShapeDragging({
    isPanning,
    updateShape,
    addShape,
    setSelectedShapeId: selectShape,
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
    resetZoom,
    onToggleShortcutsGuide: () => setShowShortcutsGuide(prev => !prev),
    onToggleAI: () => setShowAIInput(prev => !prev),
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

    if (tool !== 'select') {
      // Shape creation tool active → start drawing
      startCreating(e)
    } else {
      // Select tool — clicked on empty canvas
      const clickedOnStage = e.target === e.target.getStage()
      if (clickedOnStage) {
        // Start drag-to-select
        const stage = e.target.getStage()
        if (stage) {
          const pos = getPointerPosition(stage)
          if (pos) {
            handleStageClick() // deselect first
            startSelection(pos.x, pos.y)
          }
        }
      }
    }
  }, [tool, startCreating, setIsPanning, handleStageClick, startSelection])

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
  }, [updateCursor, isDrawing, updateSize, isResizing, handleResizeMove, isSelecting, updateSelection, selectedShapeId, tool, isPanning, getHandleCursor, cursorStyle])

  const handleMouseUp = useCallback(() => {
    if (isResizing()) {
      handleResizeEnd()
      return
    }
    if (isSelecting) {
      finishSelection(shapes)
      return
    }
    if (isDrawing) {
      finishCreating()
    }
  }, [isDrawing, finishCreating, isResizing, handleResizeEnd, isSelecting, finishSelection, shapes])

  // Shape-level event handlers
  const handleShapeMouseDown = useCallback((e: Konva.KonvaEventObject<MouseEvent>, shapeId: string) => {
    // Cancel any active drag-selection
    if (isSelecting) {
      cancelSelection()
    }

    // Shift+click = toggle multi-select; normal click = single select
    handleShapeClick(shapeId, e.evt.shiftKey)

    // If shape is already selected (single select), check if clicking on a resize handle
    const stage = e.target.getStage()
    if (stage && shapeId === selectedShapeId && selectedShapeIds.size === 1) {
      const started = tryStartResize(stage, shapeId)
      if (started) {
        e.target.stopDrag()
        e.cancelBubble = true
      }
    }
  }, [selectedShapeId, selectedShapeIds.size, tryStartResize, handleShapeClick, isSelecting, cancelSelection])

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
  const groupDragStartPos = useRef<{ x: number; y: number } | null>(null)

  const handleGroupDragStart = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    const node = e.target
    groupDragStartPos.current = { x: node.x(), y: node.y() }
  }, [])

  const handleGroupDragMove = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    if (!groupDragStartPos.current) return
    const node = e.target
    const deltaX = node.x() - groupDragStartPos.current.x
    const deltaY = node.y() - groupDragStartPos.current.y

    // Move all selected shapes by the delta
    for (const id of selectedShapeIds) {
      const shape = shapes[id]
      if (!shape) continue
      const updates: Partial<Shape> = {
        x: shape.x + deltaX,
        y: shape.y + deltaY,
      }
      if (shape.type === 'line') {
        (updates as Record<string, number>).x2 = shape.x2 + deltaX;
        (updates as Record<string, number>).y2 = shape.y2 + deltaY
      }
      updateShape(id, updates)
    }

    // Reset the reference point for the next delta
    groupDragStartPos.current = { x: node.x(), y: node.y() }
  }, [selectedShapeIds, shapes, updateShape])

  const handleGroupDragEnd = useCallback(() => {
    groupDragStartPos.current = null
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
        isAIActive={showAIInput}
        onToggleAI={() => setShowAIInput(prev => !prev)}
      />
      <UndoRedoButtons onUndo={undo} onRedo={redo} canUndo={canUndo} canRedo={canRedo} />
      <ZoomControls scale={stageScale} onResetZoom={resetZoom} />
      {selectedShapeId && shapes[selectedShapeId] && !editingShapeId && (
        <FloatingToolbar
          shape={shapes[selectedShapeId]}
          stageScale={stageScale}
          stagePos={stagePos}
          updateShape={updateShape}
          removeShape={removeShape}
          bringToFront={bringToFront}
          sendToBack={sendToBack}
          bringForward={bringForward}
          sendBackward={sendBackward}
          onDeselect={deselectAll}
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
      {showAIInput && (
        <AICommandInput
          isExecuting={aiLoading}
          onExecute={aiSend}
        />
      )}
    </>
  )
}
