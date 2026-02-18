/**
 * FloatingToolbar — Miro-style contextual shape property editor
 *
 * Appears above the selected shape. All shape editing happens here —
 * no separate property panel needed.
 *
 * Controls shown depend on shape type:
 * - All: fill color, opacity, layer ordering, delete
 * - Rect/Circle: stroke color + width
 * - Line: color, stroke width, arrow toggles
 * - Rect/Circle/Sticky: label text + label color
 * - Text/Sticky: font size
 * - Text: text color
 */

import { useMemo, useState, useRef, useEffect } from 'react'
import {
  Trash2, ArrowUpToLine, ArrowDownToLine, ArrowUp, ArrowDown,
  MoveRight, MoveLeft, Type, RotateCw,
} from 'lucide-react'
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
  // Expand/collapse for secondary controls (label, text, rotation)
  const [showMore, setShowMore] = useState(false)

  // Local label state for debounced editing.
  // Re-initialize when the shape id changes (avoids setState-in-effect).
  const [labelState, setLabelState] = useState({ shapeId: shape.id, text: shape.label || '' })
  if (labelState.shapeId !== shape.id) {
    setLabelState({ shapeId: shape.id, text: shape.label || '' })
  }
  const labelText = labelState.text
  const setLabelText = (text: string) => setLabelState({ shapeId: shape.id, text })
  const labelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleLabelChange = (value: string) => {
    setLabelText(value)
    if (labelTimerRef.current) clearTimeout(labelTimerRef.current)
    labelTimerRef.current = setTimeout(() => {
      updateShape(shape.id, { label: value } as Partial<Shape>)
    }, 300)
  }

  useEffect(() => () => {
    if (labelTimerRef.current) clearTimeout(labelTimerRef.current)
  }, [])

  // Convert shape world-space position to screen-space
  const position = useMemo(() => {
    const w = getShapeWidth(shape)
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

    const screenX = centerX * stageScale + stagePos.x
    const screenY = topY * stageScale + stagePos.y

    return { x: screenX, y: screenY }
  }, [shape, stageScale, stagePos])

  const hasStroke = shape.type === 'rectangle' || shape.type === 'circle' || shape.type === 'line'
  const hasLabel = shape.type === 'rectangle' || shape.type === 'circle' || shape.type === 'sticky'
  const hasFont = shape.type === 'text' || shape.type === 'sticky'
  const isLine = shape.type === 'line'
  const isText = shape.type === 'text'

  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateShape(shape.id, { color: e.target.value })
  }

  const handleStrokeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isLine) {
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

  const currentStrokeColor = isLine
    ? shape.color
    : (shape.type === 'rectangle' || shape.type === 'circle')
      ? shape.stroke || '#000000'
      : '#000000'

  const currentStrokeWidth = (shape.type === 'rectangle' || shape.type === 'circle')
    ? shape.strokeWidth || 0
    : isLine
      ? shape.strokeWidth
      : 0

  const opacityPercent = Math.round((shape.opacity ?? 1) * 100)

  // Position above shape
  const OFFSET_Y = showMore ? 96 : 48

  return (
    <div
      className={styles.container}
      style={{ left: position.x, top: position.y - OFFSET_Y }}
    >
      {/* Secondary row (expanded) — label, text, rotation controls */}
      {showMore && (
        <div className={styles.toolbar} style={{ marginBottom: 4 }}>
          {/* Label controls (rect, circle, sticky) */}
          {hasLabel && (
            <div className={styles.group}>
              <Type size={12} className={styles.icon} />
              <input
                className={styles.textInput}
                value={labelText}
                onChange={e => handleLabelChange(e.target.value)}
                placeholder="Label"
                title="Shape label"
              />
              <div className={styles.colorSwatch} style={{ backgroundColor: shape.labelColor || '#374151' }}>
                <input
                  type="color"
                  className={styles.colorInput}
                  value={shape.labelColor || '#374151'}
                  onChange={e => updateShape(shape.id, { labelColor: e.target.value } as Partial<Shape>)}
                  title="Label color"
                />
              </div>
            </div>
          )}

          {/* Font size (text, sticky) */}
          {hasFont && (
            <>
              {hasLabel && <div className={styles.separator} />}
              <div className={styles.group}>
                <span className={styles.label}>Size</span>
                <input
                  type="number"
                  className={styles.numberInput}
                  value={shape.type === 'text' ? shape.fontSize : shape.type === 'sticky' ? shape.fontSize : 16}
                  onChange={e => updateShape(shape.id, { fontSize: Math.max(8, parseInt(e.target.value) || 16) } as Partial<Shape>)}
                  min="8"
                  max="200"
                  title="Font size"
                />
              </div>
            </>
          )}

          {/* Text color (text only) */}
          {isText && (
            <>
              <div className={styles.separator} />
              <div className={styles.group}>
                <span className={styles.label}>Text</span>
                <div className={styles.colorSwatch} style={{ backgroundColor: shape.textColor || '#000000' }}>
                  <input
                    type="color"
                    className={styles.colorInput}
                    value={shape.textColor || '#000000'}
                    onChange={e => updateShape(shape.id, { textColor: e.target.value } as Partial<Shape>)}
                    title="Text color"
                  />
                </div>
              </div>
            </>
          )}

          {/* Rotation (non-line) */}
          {!isLine && (
            <>
              <div className={styles.separator} />
              <div className={styles.group}>
                <RotateCw size={12} className={styles.icon} />
                <input
                  type="number"
                  className={styles.numberInput}
                  value={Math.round(shape.rotation || 0)}
                  onChange={e => updateShape(shape.id, { rotation: parseFloat(e.target.value) || 0 })}
                  title="Rotation (degrees)"
                />
              </div>
            </>
          )}

          {/* Arrow toggles (line only) */}
          {isLine && (
            <div className={styles.group}>
              <button
                className={shape.arrowStart ? styles.toggleButtonActive : styles.toggleButton}
                onClick={() => updateShape(shape.id, { arrowStart: !shape.arrowStart } as Partial<Shape>)}
                title="Arrow at start"
                aria-label="Toggle arrow at start"
              >
                <MoveLeft size={14} />
              </button>
              <button
                className={shape.arrowEnd ? styles.toggleButtonActive : styles.toggleButton}
                onClick={() => updateShape(shape.id, { arrowEnd: !shape.arrowEnd } as Partial<Shape>)}
                title="Arrow at end"
                aria-label="Toggle arrow at end"
              >
                <MoveRight size={14} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Primary row — always visible */}
      <div className={styles.toolbar}>
        {/* Fill color — not shown for lines */}
        {!isLine && (
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
            {!isLine && <div className={styles.separator} />}
            <div className={styles.group}>
              <span className={styles.label}>{isLine ? 'Color' : 'Stroke'}</span>
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

        {/* More toggle — expands secondary row */}
        <div className={styles.separator} />
        <button
          className={showMore ? styles.toggleButtonActive : styles.toggleButton}
          onClick={() => setShowMore(prev => !prev)}
          title="More options"
          aria-label="Toggle more options"
        >
          ···
        </button>

        {/* Layer ordering */}
        <div className={styles.separator} />
        <button className={styles.layerButton} onClick={() => bringToFront(shape.id)}
          title="Bring to front (Ctrl+])" aria-label="Bring to front">
          <ArrowUpToLine size={14} />
        </button>
        <button className={styles.layerButton} onClick={() => bringForward(shape.id)}
          title="Bring forward (])" aria-label="Bring forward">
          <ArrowUp size={14} />
        </button>
        <button className={styles.layerButton} onClick={() => sendBackward(shape.id)}
          title="Send backward ([)" aria-label="Send backward">
          <ArrowDown size={14} />
        </button>
        <button className={styles.layerButton} onClick={() => sendToBack(shape.id)}
          title="Send to back (Ctrl+[)" aria-label="Send to back">
          <ArrowDownToLine size={14} />
        </button>

        {/* Delete */}
        <div className={styles.separator} />
        <button className={styles.deleteButton} onClick={handleDelete}
          title="Delete shape" aria-label="Delete shape">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}
