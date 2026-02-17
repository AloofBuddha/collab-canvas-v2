/**
 * FloatingToolbar — contextual shape property editor
 *
 * Appears above the selected shape. Provides quick access to:
 * - Fill color (all shapes)
 * - Stroke color (rectangle, circle, line)
 * - Stroke width (rectangle, circle, line)
 * - Opacity (all shapes)
 * - Delete button
 *
 * Positioned in screen-space by converting the shape's world-space
 * bounding box through the stage transform (pan + zoom).
 */

import { useMemo } from 'react'
import { Trash2, ArrowUpToLine, ArrowDownToLine, ArrowUp, ArrowDown } from 'lucide-react'
import type { Shape } from '../types'
import { getShapeWidth } from '../utils/shapeManipulation'
import styles from './FloatingToolbar.module.css'

interface FloatingToolbarProps {
  shape: Shape
  stageScale: number
  stagePos: { x: number; y: number }
  updateShape: (id: string, updates: Partial<Shape>) => void
  removeShape: (id: string) => void
  bringToFront: (id: string) => void
  sendToBack: (id: string) => void
  bringForward: (id: string) => void
  sendBackward: (id: string) => void
  onDeselect: () => void
}

export default function FloatingToolbar({
  shape,
  stageScale,
  stagePos,
  updateShape,
  removeShape,
  bringToFront,
  sendToBack,
  bringForward,
  sendBackward,
  onDeselect,
}: FloatingToolbarProps) {
  // Convert shape world-space position to screen-space
  const position = useMemo(() => {
    const w = getShapeWidth(shape)
    // Shape center in world coords
    const centerX = shape.type === 'circle'
      ? shape.x + shape.radiusX
      : shape.type === 'line'
        ? (shape.x + shape.x2) / 2
        : shape.x + w / 2
    const topY = shape.type === 'circle'
      ? shape.y
      : shape.type === 'line'
        ? Math.min(shape.y, shape.y2)
        : shape.y

    // World → screen
    const screenX = centerX * stageScale + stagePos.x
    const screenY = topY * stageScale + stagePos.y

    return { x: screenX, y: screenY }
  }, [shape, stageScale, stagePos])

  const hasStroke = shape.type === 'rectangle' || shape.type === 'circle' || shape.type === 'line'

  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateShape(shape.id, { color: e.target.value })
  }

  const handleStrokeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (shape.type === 'line') {
      updateShape(shape.id, { color: e.target.value })
    } else {
      updateShape(shape.id, { stroke: e.target.value } as Partial<Shape>)
    }
  }

  const handleStrokeWidthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value)
    if (!isNaN(val) && val >= 0) {
      updateShape(shape.id, { strokeWidth: val } as Partial<Shape>)
    }
  }

  const handleOpacityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value)
    updateShape(shape.id, { opacity: val / 100 })
  }

  const handleDelete = () => {
    removeShape(shape.id)
    onDeselect()
  }

  const currentStrokeColor = shape.type === 'line'
    ? shape.color
    : (shape.type === 'rectangle' || shape.type === 'circle')
      ? shape.stroke || '#000000'
      : '#000000'

  const currentStrokeWidth = (shape.type === 'rectangle' || shape.type === 'circle')
    ? shape.strokeWidth || 0
    : shape.type === 'line'
      ? shape.strokeWidth
      : 0

  const opacityPercent = Math.round((shape.opacity ?? 1) * 100)

  // Position 48px above the shape top edge
  const OFFSET_Y = 48

  return (
    <div
      className={styles.container}
      style={{ left: position.x, top: position.y - OFFSET_Y }}
    >
      <div className={styles.toolbar}>
        {/* Fill color — not shown for lines (lines only have stroke) */}
        {shape.type !== 'line' && (
          <div className={styles.group}>
            <span className={styles.label}>Fill</span>
            <div className={styles.colorSwatch} style={{ backgroundColor: shape.color }}>
              <input
                type="color"
                className={styles.colorInput}
                value={shape.color}
                onChange={handleColorChange}
                title="Fill color"
              />
            </div>
          </div>
        )}

        {/* Stroke color + width */}
        {hasStroke && (
          <>
            <div className={styles.separator} />
            <div className={styles.group}>
              <span className={styles.label}>{shape.type === 'line' ? 'Color' : 'Stroke'}</span>
              <div className={styles.colorSwatch} style={{ backgroundColor: currentStrokeColor }}>
                <input
                  type="color"
                  className={styles.colorInput}
                  value={currentStrokeColor}
                  onChange={handleStrokeChange}
                  title="Stroke color"
                />
              </div>
              <input
                type="number"
                className={styles.numberInput}
                value={currentStrokeWidth}
                onChange={handleStrokeWidthChange}
                min="0"
                max="50"
                title="Stroke width"
              />
            </div>
          </>
        )}

        {/* Opacity */}
        <div className={styles.separator} />
        <div className={styles.group}>
          <span className={styles.label}>{opacityPercent}%</span>
          <input
            type="range"
            className={styles.opacitySlider}
            value={opacityPercent}
            onChange={handleOpacityChange}
            min="0"
            max="100"
            title="Opacity"
          />
        </div>

        {/* Layer ordering */}
        <div className={styles.separator} />
        <button
          className={styles.layerButton}
          onClick={() => bringToFront(shape.id)}
          title="Bring to front (Ctrl+])"
          aria-label="Bring to front"
        >
          <ArrowUpToLine size={14} />
        </button>
        <button
          className={styles.layerButton}
          onClick={() => bringForward(shape.id)}
          title="Bring forward (])"
          aria-label="Bring forward"
        >
          <ArrowUp size={14} />
        </button>
        <button
          className={styles.layerButton}
          onClick={() => sendBackward(shape.id)}
          title="Send backward ([)"
          aria-label="Send backward"
        >
          <ArrowDown size={14} />
        </button>
        <button
          className={styles.layerButton}
          onClick={() => sendToBack(shape.id)}
          title="Send to back (Ctrl+[)"
          aria-label="Send to back"
        >
          <ArrowDownToLine size={14} />
        </button>

        {/* Delete */}
        <div className={styles.separator} />
        <button
          className={styles.deleteButton}
          onClick={handleDelete}
          title="Delete shape"
          aria-label="Delete shape"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}
