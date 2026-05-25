/**
 * ShapeRenderer - Unified shape rendering component
 *
 * Ported from V1, simplified for V2:
 * - No locking (Yjs CRDT handles conflicts)
 * - Added sticky note rendering
 * - Resize handles on selected shapes (corners + edges)
 */

import { Fragment } from 'react'
import { Rect, Ellipse, Line, Arrow, Text as KonvaText, Group, Circle, Path } from 'react-konva'
import Konva from 'konva'
import type { Shape, RectangleShape, CircleShape, LineShape, TextShape, StickyNoteShape, PolygonShape, PathShape } from '../types'
import { getShapeWidth, getShapeHeight } from '../utils/shapeManipulation'
import {
  SELECTION_COLOR,
  LINE_HANDLE_FILL,
  LINE_HANDLE_STROKE,
  NEW_SHAPE_COLOR,
} from '../utils/canvasConstants'

const HANDLE_SIZE = 8
const HANDLE_FILL = '#FFFFFF'
const HANDLE_STROKE = SELECTION_COLOR
const HANDLE_STROKE_WIDTH = 1.5

/**
 * Renders resize handles (corners + edges) around a selected shape.
 * Handles are rendered in the Group's local coordinate space (centered on shape).
 */
function ResizeHandles({ shape, stageScale }: { shape: Shape; stageScale: number }) {
  if (shape.type === 'line') return null // Lines use endpoint handles instead

  const w = getShapeWidth(shape)
  const h = getShapeHeight(shape)
  const halfW = w / 2
  const halfH = h / 2
  const size = HANDLE_SIZE / stageScale
  const halfSize = size / 2
  const strokeWidth = HANDLE_STROKE_WIDTH / stageScale

  // Corner and edge handle positions (in local coords, origin at shape center)
  const handles = [
    // Corners
    { x: -halfW - halfSize, y: -halfH - halfSize },
    { x: halfW - halfSize, y: -halfH - halfSize },
    { x: -halfW - halfSize, y: halfH - halfSize },
    { x: halfW - halfSize, y: halfH - halfSize },
    // Edge midpoints
    { x: -halfSize, y: -halfH - halfSize },
    { x: -halfSize, y: halfH - halfSize },
    { x: -halfW - halfSize, y: -halfSize },
    { x: halfW - halfSize, y: -halfSize },
  ]

  return (
    <Fragment>
      {handles.map((pos, i) => (
        <Rect
          key={i}
          x={pos.x}
          y={pos.y}
          width={size}
          height={size}
          fill={HANDLE_FILL}
          stroke={HANDLE_STROKE}
          strokeWidth={strokeWidth}
          listening={false}
        />
      ))}
    </Fragment>
  )
}

/**
 * Invisible expansion of the parent Group's hit area so that very small
 * shapes — AI-generated 2px wide circles, single-pixel polygons — remain
 * clickable. Renders nothing visually but contributes its rect to the
 * Group's union hit zone. Centered on the shape's local origin (after the
 * usual offsetX/offsetY centering in each render branch).
 */
const MIN_HIT_DIM = 16
function MinHitArea({ width, height, stageScale }: { width: number; height: number; stageScale: number }) {
  // In world coordinates, screen pixels = world * stageScale; we want a
  // 16-screen-pixel minimum, so the world-space dim is 16 / stageScale.
  const minWorld = MIN_HIT_DIM / stageScale
  if (width >= minWorld && height >= minWorld) return null
  const hitW = Math.max(width, minWorld)
  const hitH = Math.max(height, minWorld)
  return (
    <Rect
      width={hitW}
      height={hitH}
      offsetX={hitW / 2}
      offsetY={hitH / 2}
      fill="transparent"
    />
  )
}

/**
 * Renders the text overlay on a shape. Reads the unified text/font/align
 * fields from BaseShape; falls back to the deprecated label/labelFontSize/
 * labelColor fields so older data still draws.
 */
function ShapeText({ shape, width, height }: { shape: Shape; width: number; height: number }) {
  const content = shape.text ?? shape.label
  if (!content) return null
  const fontSize = shape.fontSize ?? shape.labelFontSize
    ?? Math.min(24, Math.max(10, Math.min(width, height) / 6))
  const fill = shape.textColor ?? shape.labelColor ?? '#374151'
  const fontFamily = shape.fontFamily ?? 'Inter, system-ui, sans-serif'
  const align = shape.align ?? 'center'
  const verticalAlign = shape.verticalAlign ?? 'middle'
  return (
    <KonvaText
      text={content}
      fontSize={fontSize}
      fontFamily={fontFamily}
      fill={fill}
      width={width}
      height={height}
      offsetX={width / 2}
      offsetY={height / 2}
      align={align}
      verticalAlign={verticalAlign}
      padding={4}
      listening={false}
    />
  )
}

interface ShapeRendererProps {
  shape: Shape
  isSelected: boolean
  /** Show resize/rotate handles. Only true for single selection — multi-select
   *  uses the outer MultiSelectBounds box and hides per-shape handles to avoid
   *  visual clutter. */
  showHandles?: boolean
  /** Show the dashed selection border on this individual shape. Suppressed
   *  for grouped selections so the outer MultiSelectBounds reads as a single
   *  group outline instead of N overlapping per-shape borders. */
  showBorder?: boolean
  isEditing?: boolean
  stageScale: number
  onMouseDown: (e: Konva.KonvaEventObject<MouseEvent>, shapeId: string) => void
  onDragStart: (e: Konva.KonvaEventObject<DragEvent>, shape: Shape) => void
  onDragMove: (e: Konva.KonvaEventObject<DragEvent>, shape: Shape) => void
  onDragEnd: (shape: Shape) => void
  onDoubleClick?: (shapeId: string) => void
}

export default function ShapeRenderer({
  shape,
  isSelected,
  showHandles = true,
  showBorder: showBorderProp,
  isEditing,
  stageScale,
  onMouseDown,
  onDragStart,
  onDragMove,
  onDragEnd,
  onDoubleClick,
}: ShapeRendererProps) {
  const showBorder = isSelected && (showBorderProp ?? true)
  const borderColor = SELECTION_COLOR
  const inverseBorderWidth = Math.max(2, 4 * Math.pow(stageScale, -0.6))
  const shapeOpacity = shape.opacity ?? 1.0

  const groupEvents = {
    onMouseDown: (e: Konva.KonvaEventObject<MouseEvent>) => onMouseDown(e, shape.id),
    onDragStart: (e: Konva.KonvaEventObject<DragEvent>) => onDragStart(e, shape),
    onDragMove: (e: Konva.KonvaEventObject<DragEvent>) => onDragMove(e, shape),
    onDragEnd: () => onDragEnd(shape),
  }

  const renderShape = () => {
    switch (shape.type) {
      case 'rectangle': {
        const rect = shape as RectangleShape
        const shapeStrokeWidth = rect.strokeWidth || 0
        const selectionPadding = shapeStrokeWidth / 2 + inverseBorderWidth / 2
        const selectionWidth = rect.width + selectionPadding * 2
        const selectionHeight = rect.height + selectionPadding * 2

        return (
          <Group
            x={rect.x + rect.width / 2}
            y={rect.y + rect.height / 2}
            rotation={shape.rotation || 0}
            draggable
            {...groupEvents}
          >
            <Rect
              width={rect.width}
              height={rect.height}
              offsetX={rect.width / 2}
              offsetY={rect.height / 2}
              fill={rect.color}
              opacity={shapeOpacity}
              stroke={rect.stroke}
              strokeWidth={shapeStrokeWidth}
              cornerRadius={rect.cornerRadius ?? 0}
            />
            <MinHitArea width={rect.width} height={rect.height} stageScale={stageScale} />
            <ShapeText shape={rect} width={rect.width} height={rect.height} />
            {showBorder && (
              <Rect
                width={selectionWidth}
                height={selectionHeight}
                offsetX={selectionWidth / 2}
                offsetY={selectionHeight / 2}
                stroke={borderColor}
                strokeWidth={inverseBorderWidth}
                dash={[8 / stageScale, 4 / stageScale]}
                fill="transparent"
              />
            )}
            {(isSelected && showHandles) && <ResizeHandles shape={rect} stageScale={stageScale} />}
          </Group>
        )
      }

      case 'circle': {
        const circle = shape as CircleShape
        const shapeStrokeWidth = circle.strokeWidth || 0
        const selectionPadding = shapeStrokeWidth / 2 + inverseBorderWidth / 2
        const selectionRadiusX = circle.radiusX + selectionPadding
        const selectionRadiusY = circle.radiusY + selectionPadding
        // Bounding box for hit region so corner handles are clickable
        const bbWidth = circle.radiusX * 2
        const bbHeight = circle.radiusY * 2
        const handlePadding = HANDLE_SIZE / stageScale

        return (
          <Group
            x={circle.x + circle.radiusX}
            y={circle.y + circle.radiusY}
            rotation={shape.rotation || 0}
            draggable
            {...groupEvents}
          >
            {/* Invisible bounding-box hit region — extends to cover resize handles
                so clicks on corner handles don't fall through to the Stage */}
            {isSelected && (
              <Rect
                width={bbWidth + handlePadding * 2}
                height={bbHeight + handlePadding * 2}
                offsetX={bbWidth / 2 + handlePadding}
                offsetY={bbHeight / 2 + handlePadding}
                fill="transparent"
                listening={true}
              />
            )}
            <Ellipse
              radiusX={circle.radiusX}
              radiusY={circle.radiusY}
              fill={circle.color}
              opacity={shapeOpacity}
              stroke={circle.stroke}
              strokeWidth={shapeStrokeWidth}
            />
            <MinHitArea width={circle.radiusX * 2} height={circle.radiusY * 2} stageScale={stageScale} />
            <ShapeText shape={circle} width={circle.radiusX * 2} height={circle.radiusY * 2} />
            {showBorder && (
              <Ellipse
                radiusX={selectionRadiusX}
                radiusY={selectionRadiusY}
                stroke={borderColor}
                strokeWidth={inverseBorderWidth}
                dash={[8 / stageScale, 4 / stageScale]}
                fill="transparent"
              />
            )}
            {(isSelected && showHandles) && <ResizeHandles shape={circle} stageScale={stageScale} />}
          </Group>
        )
      }

      case 'line': {
        const line = shape as LineShape
        const centerX = (line.x + line.x2) / 2
        const centerY = (line.y + line.y2) / 2
        const points = [
          line.x - centerX, line.y - centerY,
          line.x2 - centerX, line.y2 - centerY,
        ]
        const hasArrow = line.arrowStart || line.arrowEnd
        const pointerLength = 10 * (line.strokeWidth / 4)
        const pointerWidth = 10 * (line.strokeWidth / 4)
        const LineComponent = hasArrow ? Arrow : Line

        return (
          <Group
            x={centerX}
            y={centerY}
            rotation={shape.rotation || 0}
            draggable
            {...groupEvents}
          >
            {showBorder && (
              <Line
                points={points}
                stroke={borderColor}
                strokeWidth={line.strokeWidth + (4 / stageScale)}
                dash={[8 / stageScale, 4 / stageScale]}
                opacity={0.5}
                listening={false}
              />
            )}
            <LineComponent
              points={points}
              stroke={line.color}
              strokeWidth={line.strokeWidth}
              // hitStrokeWidth expands the click zone without changing the
              // visible thickness — a 1px line still LOOKS 1px but the user
              // can grab it within ~14px screen pixels of its centerline.
              hitStrokeWidth={Math.max(line.strokeWidth, 14 / stageScale)}
              opacity={shapeOpacity}
              {...(hasArrow ? {
                pointerLength,
                pointerWidth,
                pointerAtBeginning: line.arrowStart || false,
                pointerAtEnding: line.arrowEnd || false,
                fill: line.color,
              } : {})}
            />
            {(isSelected && showHandles) && (
              <Fragment>
                <Circle
                  x={points[0]}
                  y={points[1]}
                  radius={6 / stageScale}
                  fill={LINE_HANDLE_FILL}
                  stroke={LINE_HANDLE_STROKE}
                  strokeWidth={2 / stageScale}
                />
                <Circle
                  x={points[2]}
                  y={points[3]}
                  radius={6 / stageScale}
                  fill={LINE_HANDLE_FILL}
                  stroke={LINE_HANDLE_STROKE}
                  strokeWidth={2 / stageScale}
                />
              </Fragment>
            )}
          </Group>
        )
      }

      case 'text': {
        const text = shape as TextShape

        return (
          <Group
            x={text.x + text.width / 2}
            y={text.y + text.height / 2}
            rotation={shape.rotation || 0}
            draggable
            {...groupEvents}
            onDblClick={() => onDoubleClick?.(shape.id)}
          >
            <Rect
              width={text.width}
              height={text.height}
              offsetX={text.width / 2}
              offsetY={text.height / 2}
              fill={text.color}
              opacity={shapeOpacity}
            />
            {showBorder && (
              <Rect
                width={text.width}
                height={text.height}
                offsetX={text.width / 2}
                offsetY={text.height / 2}
                stroke={borderColor}
                strokeWidth={inverseBorderWidth}
                dash={[8 / stageScale, 4 / stageScale]}
                fill="transparent"
              />
            )}
            {!isEditing && (
              <KonvaText
                offsetX={text.width / 2}
                offsetY={text.height / 2}
                text={text.text}
                fontSize={text.fontSize}
                fontFamily={text.fontFamily}
                fill={text.textColor}
                width={text.width}
                height={text.height}
                align={text.align || 'left'}
                verticalAlign={text.verticalAlign || 'top'}
              />
            )}
            {(isSelected && showHandles && !isEditing) && <ResizeHandles shape={text} stageScale={stageScale} />}
          </Group>
        )
      }

      case 'sticky': {
        const sticky = shape as StickyNoteShape

        return (
          <Group
            x={sticky.x + sticky.width / 2}
            y={sticky.y + sticky.height / 2}
            rotation={shape.rotation || 0}
            draggable
            {...groupEvents}
            onDblClick={() => onDoubleClick?.(shape.id)}
          >
            <Rect
              width={sticky.width}
              height={sticky.height}
              offsetX={sticky.width / 2}
              offsetY={sticky.height / 2}
              fill={sticky.color}
              opacity={shapeOpacity}
              cornerRadius={4}
              shadowColor="rgba(0,0,0,0.15)"
              shadowBlur={8}
              shadowOffsetY={2}
            />
            <ShapeText shape={sticky} width={sticky.width} height={sticky.height} />
            {showBorder && (
              <Rect
                width={sticky.width}
                height={sticky.height}
                offsetX={sticky.width / 2}
                offsetY={sticky.height / 2}
                stroke={borderColor}
                strokeWidth={inverseBorderWidth}
                dash={[8 / stageScale, 4 / stageScale]}
                fill="transparent"
              />
            )}
            {!isEditing && (
              <KonvaText
                offsetX={sticky.width / 2}
                offsetY={sticky.height / 2}
                text={sticky.text}
                fontSize={sticky.fontSize}
                fill="#1F2937"
                width={sticky.width}
                height={sticky.height}
                padding={12}
                align="left"
                verticalAlign="top"
              />
            )}
            {(isSelected && showHandles && !isEditing) && <ResizeHandles shape={sticky} stageScale={stageScale} />}
          </Group>
        )
      }

      case 'polygon': {
        const poly = shape as PolygonShape
        const polyStrokeWidth = poly.strokeWidth || 0
        const selectionPadding = polyStrokeWidth / 2 + inverseBorderWidth / 2
        return (
          <Group
            x={poly.x + poly.width / 2}
            y={poly.y + poly.height / 2}
            rotation={shape.rotation || 0}
            draggable
            {...groupEvents}
          >
            <Line
              points={poly.points}
              closed
              fill={poly.color}
              opacity={shapeOpacity}
              stroke={poly.stroke}
              strokeWidth={polyStrokeWidth}
              lineJoin="round"
              offsetX={poly.width / 2}
              offsetY={poly.height / 2}
            />
            <MinHitArea width={poly.width} height={poly.height} stageScale={stageScale} />
            <ShapeText shape={poly} width={poly.width} height={poly.height} />
            {showBorder && (
              <Rect
                width={poly.width + selectionPadding * 2}
                height={poly.height + selectionPadding * 2}
                offsetX={poly.width / 2 + selectionPadding}
                offsetY={poly.height / 2 + selectionPadding}
                stroke={borderColor}
                strokeWidth={inverseBorderWidth}
                dash={[8 / stageScale, 4 / stageScale]}
                fill="transparent"
              />
            )}
            {(isSelected && showHandles) && <ResizeHandles shape={poly} stageScale={stageScale} />}
          </Group>
        )
      }

      case 'path': {
        const path = shape as PathShape
        const pathStrokeWidth = path.strokeWidth || 0
        const selectionPadding = pathStrokeWidth / 2 + inverseBorderWidth / 2
        const vbW = path.viewBoxWidth ?? path.width ?? 1
        const vbH = path.viewBoxHeight ?? path.height ?? 1
        const sx = vbW > 0 ? path.width / vbW : 1
        const sy = vbH > 0 ? path.height / vbH : 1
        return (
          <Group
            x={path.x + path.width / 2}
            y={path.y + path.height / 2}
            rotation={shape.rotation || 0}
            draggable
            {...groupEvents}
          >
            <Path
              data={path.d}
              fill={path.color}
              opacity={shapeOpacity}
              stroke={path.stroke}
              strokeWidth={pathStrokeWidth}
              hitStrokeWidth={Math.max(pathStrokeWidth, 14 / stageScale)}
              lineJoin="round"
              lineCap="round"
              scaleX={sx}
              scaleY={sy}
              offsetX={vbW / 2}
              offsetY={vbH / 2}
            />
            <MinHitArea width={path.width} height={path.height} stageScale={stageScale} />
            {showBorder && (
              <Rect
                width={path.width + selectionPadding * 2}
                height={path.height + selectionPadding * 2}
                offsetX={path.width / 2 + selectionPadding}
                offsetY={path.height / 2 + selectionPadding}
                stroke={borderColor}
                strokeWidth={inverseBorderWidth}
                dash={[8 / stageScale, 4 / stageScale]}
                fill="transparent"
              />
            )}
            {(isSelected && showHandles) && <ResizeHandles shape={path} stageScale={stageScale} />}
          </Group>
        )
      }

      default:
        return null
    }
  }

  return <Fragment key={shape.id}>{renderShape()}</Fragment>
}

/**
 * Render a shape being created (preview during drag)
 */
export function NewShapeRenderer({ shape }: { shape: Shape }) {
  const newShapeOpacity = shape.opacity ?? 0.5
  const commonProps = { fill: NEW_SHAPE_COLOR, opacity: newShapeOpacity }

  switch (shape.type) {
    case 'rectangle':
    case 'sticky': {
      const s = shape as RectangleShape | StickyNoteShape
      return <Rect x={s.x} y={s.y} width={s.width} height={s.height} {...commonProps} />
    }
    case 'circle': {
      const circle = shape as CircleShape
      return (
        <Ellipse
          x={circle.x + circle.radiusX}
          y={circle.y + circle.radiusY}
          radiusX={Math.abs(circle.radiusX)}
          radiusY={Math.abs(circle.radiusY)}
          {...commonProps}
        />
      )
    }
    case 'line': {
      const line = shape as LineShape
      return (
        <Line
          x={line.x}
          y={line.y}
          points={[0, 0, line.x2 - line.x, line.y2 - line.y]}
          stroke={NEW_SHAPE_COLOR}
          strokeWidth={2}
          opacity={newShapeOpacity}
        />
      )
    }
    case 'text': {
      const text = shape as TextShape
      return (
        <Group>
          <Rect x={text.x} y={text.y} width={text.width} height={text.height} {...commonProps} />
          <KonvaText
            x={text.x}
            y={text.y}
            text={text.text}
            fontSize={text.fontSize}
            fontFamily={text.fontFamily}
            fill={text.textColor}
            width={text.width}
            height={text.height}
            opacity={newShapeOpacity}
          />
        </Group>
      )
    }
    case 'polygon': {
      const poly = shape as PolygonShape
      const ox = Math.min(poly.x, poly.x + poly.width)
      const oy = Math.min(poly.y, poly.y + poly.height)
      return (
        <Line
          x={ox}
          y={oy}
          points={poly.points}
          closed
          fill={NEW_SHAPE_COLOR}
          opacity={newShapeOpacity}
          stroke={NEW_SHAPE_COLOR}
          strokeWidth={1}
          listening={false}
        />
      )
    }
    case 'path': {
      const path = shape as PathShape
      const ox = Math.min(path.x, path.x + path.width)
      const oy = Math.min(path.y, path.y + path.height)
      const vbW = path.viewBoxWidth ?? 100
      const vbH = path.viewBoxHeight ?? 100
      const w = Math.abs(path.width)
      const h = Math.abs(path.height)
      const sx = vbW > 0 ? w / vbW : 1
      const sy = vbH > 0 ? h / vbH : 1
      return (
        <Path
          x={ox}
          y={oy}
          data={path.d}
          fill={NEW_SHAPE_COLOR}
          opacity={newShapeOpacity}
          stroke={NEW_SHAPE_COLOR}
          strokeWidth={1}
          scaleX={sx}
          scaleY={sy}
          listening={false}
        />
      )
    }
    default:
      return null
  }
}
