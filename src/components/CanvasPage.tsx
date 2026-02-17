/**
 * CanvasPage - Main canvas orchestration component
 *
 * Rewritten for V2: wires useBoard (Yjs), pan/zoom, shape creation, and dragging.
 * References V1's Canvas.tsx mouse handler flow but is much simpler (~200 lines vs 924).
 */

import { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { Stage, Layer } from 'react-konva'
import Konva from 'konva'
import { useBoard } from '../hooks/useBoard'
import { useCanvasPanning } from '../hooks/useCanvasPanning'
import { useCanvasZoom } from '../hooks/useCanvasZoom'
import { useShapeCreation } from '../hooks/useShapeCreation'
import { useShapeDragging } from '../hooks/useShapeDragging'
import { useShapeResize } from '../hooks/useShapeResize'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import ShapeRenderer, { NewShapeRenderer } from './ShapeRenderer'
import DimensionLabel from './DimensionLabel'
import RemoteCursor from './RemoteCursor'
import GridBackground from './GridBackground'
import Toolbar from './Toolbar'
import FloatingToolbar from './FloatingToolbar'
import InlineTextEditor from './InlineTextEditor'
import Header from './Header'
import { getCursorStyle } from '../utils/canvasUtils'
import { getPointerPosition } from '../utils/shapeManipulation'
import type { Tool, Shape, User, TextShape, StickyNoteShape } from '../types'
import { HEADER_HEIGHT } from '../utils/canvasConstants'
import { signOut } from '../utils/auth'

interface CanvasPageProps {
  user: User
}

export function CanvasPage({ user }: CanvasPageProps) {
  const { boardId } = useParams<{ boardId: string }>()
  const stageRef = useRef<Konva.Stage>(null)
  const [tool, setTool] = useState<Tool>('select')
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null)
  const [stageScale, setStageScale] = useState(1)
  const [windowSize, setWindowSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight - HEADER_HEIGHT,
  })
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 })
  const [editingShapeId, setEditingShapeId] = useState<string | null>(null)

  // Core Yjs hook — shapes, cursors, CRUD
  const {
    shapes,
    remoteCursors,
    onlineUsers,
    localColor,
    updateCursor,
    addShape,
    updateShape,
    removeShape,
    undo,
    redo,
    bringToFront,
    sendToBack,
    bringForward,
    sendBackward,
  } = useBoard(boardId!, user)

  // Pan & Zoom
  const { isPanning, setIsPanning } = useCanvasPanning({ stageRef })
  const { handleWheel: baseHandleWheel } = useCanvasZoom({ onScaleChange: setStageScale })

  // Wrap wheel handler to also track stage position
  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    baseHandleWheel(e)
    const stage = e.target.getStage()
    if (stage) setStagePos(stage.position())
  }, [baseHandleWheel])

  // Shape creation (click-drag)
  const { isDrawing, newShape, startCreating, updateSize, finishCreating } = useShapeCreation({
    userId: user.userId,
    onShapeCreated: addShape,
    onToolChange: setTool,
    shapeType: tool === 'select' ? 'rectangle' : tool,
  })

  // Shape dragging
  const { handleDragStart, handleDragMove, handleDragEnd } = useShapeDragging({
    isPanning,
    updateShape,
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

  // Window resize
  useEffect(() => {
    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight - HEADER_HEIGHT,
      })
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Keyboard shortcuts (Delete, Ctrl+D, arrow nudge, Escape, Ctrl+A)
  useKeyboardShortcuts({
    shapes,
    selectedShapeId,
    setSelectedShapeId,
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
  })

  // Cursor style (needed by mouse handlers below)
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
      // Select tool — clicked on empty canvas → deselect
      const clickedOnStage = e.target === e.target.getStage()
      if (clickedOnStage) {
        setSelectedShapeId(null)
      }
    }
  }, [tool, startCreating, setIsPanning])

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
  }, [updateCursor, isDrawing, updateSize, isResizing, handleResizeMove, selectedShapeId, tool, isPanning, getHandleCursor, cursorStyle])

  const handleMouseUp = useCallback(() => {
    if (isResizing()) {
      handleResizeEnd()
      return
    }
    if (isDrawing) {
      finishCreating()
    }
  }, [isDrawing, finishCreating, isResizing, handleResizeEnd])

  // Shape-level event handlers
  const handleShapeMouseDown = useCallback((e: Konva.KonvaEventObject<MouseEvent>, shapeId: string) => {
    setSelectedShapeId(shapeId)

    // If shape is already selected, check if clicking on a resize handle
    const stage = e.target.getStage()
    if (stage && shapeId === selectedShapeId) {
      const started = tryStartResize(stage, shapeId)
      if (started) {
        // Prevent Konva's native drag from interfering with resize
        e.target.stopDrag()
        e.cancelBubble = true
      }
    }
  }, [selectedShapeId, tryStartResize])

  const handleShapeDragStart = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    handleDragStart(e)
  }, [handleDragStart])

  const handleShapeDragMove = useCallback((e: Konva.KonvaEventObject<DragEvent>, shape: Shape) => {
    handleDragMove(e, shape)

    // Also update cursor position during drag — Konva's native drag
    // swallows Stage mousemove events, so remote users would see the
    // cursor frozen at the drag-start position without this.
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
      />
      <Stage
        ref={stageRef}
        width={windowSize.width}
        height={windowSize.height}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        style={{ background: '#fafafa' }}
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
              isSelected={shape.id === selectedShapeId}
              isEditing={shape.id === editingShapeId}
              stageScale={stageScale}
              onMouseDown={handleShapeMouseDown}
              onDragStart={handleShapeDragStart}
              onDragMove={handleShapeDragMove}
              onDragEnd={handleShapeDragEnd}
              onDoubleClick={handleDoubleClick}
            />
          ))}

          {/* Dimension label for selected shape */}
          {selectedShapeId && shapes[selectedShapeId] && !editingShapeId && (
            <DimensionLabel
              shape={shapes[selectedShapeId]}
              stageScale={stageScale}
            />
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
      <Toolbar selectedTool={tool} onSelectTool={setTool} />
      {selectedShapeId && shapes[selectedShapeId] && !editingShapeId && (
        <FloatingToolbar
          shape={shapes[selectedShapeId]}
          stageScale={stageScale}
          stagePos={stagePos}
          headerHeight={HEADER_HEIGHT}
          updateShape={updateShape}
          removeShape={removeShape}
          bringToFront={bringToFront}
          sendToBack={sendToBack}
          bringForward={bringForward}
          sendBackward={sendBackward}
          onDeselect={() => setSelectedShapeId(null)}
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
    </>
  )
}
