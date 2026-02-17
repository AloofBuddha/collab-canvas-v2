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
import ShapeRenderer, { NewShapeRenderer } from './ShapeRenderer'
import RemoteCursor from './RemoteCursor'
import GridBackground from './GridBackground'
import Toolbar from './Toolbar'
import Header from './Header'
import { getCursorStyle } from '../utils/canvasUtils'
import { getPointerPosition } from '../utils/shapeManipulation'
import type { Tool, Shape, User } from '../types'
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

  // Delete selected shape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedShapeId) {
        removeShape(selectedShapeId)
        setSelectedShapeId(null)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [selectedShapeId, removeShape])

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
    }

    // Update shape creation preview
    if (isDrawing) {
      updateSize(e)
    }
  }, [updateCursor, isDrawing, updateSize])

  const handleMouseUp = useCallback(() => {
    if (isDrawing) {
      finishCreating()
    }
  }, [isDrawing, finishCreating])

  // Shape-level event handlers
  const handleShapeMouseDown = useCallback((_e: Konva.KonvaEventObject<MouseEvent>, shapeId: string) => {
    setSelectedShapeId(shapeId)
  }, [])

  const handleShapeDragStart = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    handleDragStart(e)
  }, [handleDragStart])

  const handleShapeDragMove = useCallback((e: Konva.KonvaEventObject<DragEvent>, shape: Shape) => {
    handleDragMove(e, shape)
  }, [handleDragMove])

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleShapeDragEnd = useCallback((_shape: Shape) => {
    handleDragEnd()
  }, [handleDragEnd])

  // Sync stage position after panning ends
  useEffect(() => {
    if (!isPanning && stageRef.current) {
      setStagePos(stageRef.current.position())
    }
  }, [isPanning])

  // Cursor style
  const cursorStyle = getCursorStyle(isPanning, isDrawing, tool)

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
              stageScale={stageScale}
              onMouseDown={handleShapeMouseDown}
              onDragStart={handleShapeDragStart}
              onDragMove={handleShapeDragMove}
              onDragEnd={handleShapeDragEnd}
            />
          ))}

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
    </>
  )
}
