/**
 * SidePanel — right-anchored property editor for a single selected shape.
 *
 * Mounts only when exactly one shape is selected. Owns the full set of editable
 * properties (selection-set actions like layering and grouping live in the
 * floating tooltip instead).
 *
 * Text/number/color edits are debounced so we don't spam the Yjs map.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  X, Square, Circle as CircleIcon, Minus, Type as TypeIcon, StickyNote,
  AlignLeft, AlignCenter, AlignRight,
  AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd,
} from 'lucide-react'
import type {
  Shape,
  RectangleShape,
  CircleShape,
  LineShape,
  TextShape,
  StickyNoteShape,
  PolygonShape,
  PathShape,
} from '../types'
import { regularPolygonPoints } from '../utils/shapeFactory'
import styles from './SidePanel.module.css'

const DEBOUNCE_MS = 200
const FONT_FAMILIES = ['Arial', 'Helvetica', 'Times New Roman', 'Courier New', 'Georgia', 'Verdana']

function colorToHex(color: string | undefined): string {
  if (!color || color === 'transparent') return '#ffffff'
  if (color.startsWith('#')) return color
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) return '#000000'
  ctx.fillStyle = color
  return ctx.fillStyle as string
}

function shapeIcon(type: Shape['type']) {
  switch (type) {
    case 'rectangle': return <Square size={14} />
    case 'circle': return <CircleIcon size={14} />
    case 'line': return <Minus size={14} />
    case 'text': return <TypeIcon size={14} />
    case 'sticky': return <StickyNote size={14} />
    case 'polygon': return <Square size={14} />  // reuse — no perfect lucide match
    case 'path': return <Minus size={14} />       // reuse
  }
}

interface SidePanelProps {
  shape: Shape
  onUpdate: (id: string, updates: Partial<Shape>) => void
  onClose: () => void
}

export default function SidePanel({ shape, onUpdate, onClose }: SidePanelProps) {
  const onUpdateRef = useRef(onUpdate)
  useEffect(() => { onUpdateRef.current = onUpdate })

  const shapeIdRef = useRef(shape.id)
  shapeIdRef.current = shape.id

  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const pendingRef = useRef<Partial<Shape>>({})

  const flush = useCallback(() => {
    const updates = pendingRef.current
    if (Object.keys(updates).length === 0) return
    pendingRef.current = {}
    onUpdateRef.current(shapeIdRef.current, updates)
  }, [])

  const queueUpdate = useCallback((updates: Partial<Shape>, key: string = 'default') => {
    Object.assign(pendingRef.current, updates)
    if (timersRef.current[key]) clearTimeout(timersRef.current[key])
    timersRef.current[key] = setTimeout(() => {
      delete timersRef.current[key]
      flush()
    }, DEBOUNCE_MS)
  }, [flush])

  // Flush on selection change / unmount so in-flight debounce isn't lost.
  useEffect(() => {
    return () => {
      for (const t of Object.values(timersRef.current)) clearTimeout(t)
      timersRef.current = {}
      flush()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shape.id])

  return (
    <aside className={styles.panel} aria-label="Shape properties">
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <span className={styles.typeBadge}>{shapeIcon(shape.type)}</span>
          <h2 className={styles.title}>{shape.type}</h2>
        </div>
        <button
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Close properties panel"
          title="Deselect"
        >
          <X size={16} />
        </button>
      </header>

      <div className={styles.body}>
        <PositionSection shape={shape} queueUpdate={queueUpdate} />
        <AppearanceSection shape={shape} queueUpdate={queueUpdate} />

        {shape.type === 'rectangle' && (
          <RectangleSection shape={shape} queueUpdate={queueUpdate} />
        )}
        {shape.type === 'circle' && (
          <CircleSection shape={shape} queueUpdate={queueUpdate} />
        )}
        {shape.type === 'line' && (
          <LineSection shape={shape} queueUpdate={queueUpdate} />
        )}
        {shape.type === 'text' && (
          <TextSection shape={shape} queueUpdate={queueUpdate} />
        )}
        {shape.type === 'sticky' && (
          <StickySection shape={shape} queueUpdate={queueUpdate} />
        )}
        {shape.type === 'polygon' && (
          <PolygonSection shape={shape} queueUpdate={queueUpdate} />
        )}
        {shape.type === 'path' && (
          <PathSection shape={shape} queueUpdate={queueUpdate} />
        )}

        {/* Text is now a property of any text-bearing primitive. Shown for
            rect/circle/polygon (TextShape/StickyNoteShape already render their
            own text controls within their type-specific sections). */}
        {(shape.type === 'rectangle' || shape.type === 'circle' || shape.type === 'polygon') && (
          <ShapeTextSection shape={shape} queueUpdate={queueUpdate} />
        )}
      </div>
    </aside>
  )
}

// ============================================================================
// Sections
// ============================================================================

type QueueUpdate = (updates: Partial<Shape>, key?: string) => void

interface SectionProps<T extends Shape> {
  shape: T
  queueUpdate: QueueUpdate
}

function PositionSection({ shape, queueUpdate }: SectionProps<Shape>) {
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>Position</h3>
      <div className={styles.row}>
        <NumberCell
          label="X"
          value={Math.round(shape.x)}
          onChange={(v) => queueUpdate({ x: v }, 'pos')}
        />
        <NumberCell
          label="Y"
          value={Math.round(shape.y)}
          onChange={(v) => queueUpdate({ y: v }, 'pos')}
        />
      </div>
      {shape.type !== 'line' && (
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Rotation</span>
          <div className={styles.fieldControl}>
            <NumberInput
              value={Math.round(shape.rotation ?? 0)}
              onChange={(v) => queueUpdate({ rotation: v }, 'rotation')}
              min={-360}
              max={360}
            />
          </div>
        </div>
      )}
    </section>
  )
}

function AppearanceSection({ shape, queueUpdate }: SectionProps<Shape>) {
  const opacityPct = Math.round((shape.opacity ?? 1) * 100)
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>Appearance</h3>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>Fill</span>
        <ColorPicker
          value={shape.color}
          onChange={(v) => queueUpdate({ color: v }, 'color')}
        />
      </div>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>Opacity</span>
        <div className={styles.rangeWrap}>
          <input
            type="range"
            className={styles.range}
            min={0}
            max={100}
            step={1}
            value={opacityPct}
            onChange={(e) => queueUpdate({ opacity: Number(e.target.value) / 100 }, 'opacity')}
          />
          <span className={styles.rangeValue}>{opacityPct}%</span>
        </div>
      </div>
    </section>
  )
}

function RectangleSection({ shape, queueUpdate }: SectionProps<RectangleShape>) {
  return (
    <>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Size</h3>
        <div className={styles.row}>
          <NumberCell label="Width" value={Math.round(shape.width)} min={1}
            onChange={(v) => queueUpdate({ width: v } as Partial<Shape>, 'size')} />
          <NumberCell label="Height" value={Math.round(shape.height)} min={1}
            onChange={(v) => queueUpdate({ height: v } as Partial<Shape>, 'size')} />
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Corners</span>
          <div className={styles.fieldControl}>
            <NumberInput value={shape.cornerRadius ?? 0} min={0} max={200}
              onChange={(v) => queueUpdate({ cornerRadius: v } as Partial<Shape>, 'cornerRadius')} />
          </div>
        </div>
      </section>
      <BorderSection shape={shape} queueUpdate={queueUpdate} />
    </>
  )
}

function CircleSection({ shape, queueUpdate }: SectionProps<CircleShape>) {
  return (
    <>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Size</h3>
        <div className={styles.row}>
          <NumberCell label="Radius X" value={Math.round(shape.radiusX)} min={1}
            onChange={(v) => queueUpdate({ radiusX: v } as Partial<Shape>, 'size')} />
          <NumberCell label="Radius Y" value={Math.round(shape.radiusY)} min={1}
            onChange={(v) => queueUpdate({ radiusY: v } as Partial<Shape>, 'size')} />
        </div>
      </section>
      <BorderSection shape={shape} queueUpdate={queueUpdate} />
    </>
  )
}

function LineSection({ shape, queueUpdate }: SectionProps<LineShape>) {
  return (
    <>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Endpoint</h3>
        <div className={styles.row}>
          <NumberCell label="X2" value={Math.round(shape.x2)}
            onChange={(v) => queueUpdate({ x2: v } as Partial<Shape>, 'endpoint')} />
          <NumberCell label="Y2" value={Math.round(shape.y2)}
            onChange={(v) => queueUpdate({ y2: v } as Partial<Shape>, 'endpoint')} />
        </div>
      </section>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Stroke</h3>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Width</span>
          <div className={styles.fieldControl}>
            <NumberInput value={shape.strokeWidth} min={1} max={50}
              onChange={(v) => queueUpdate({ strokeWidth: v } as Partial<Shape>, 'strokeWidth')} />
          </div>
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Arrow</span>
          <ArrowToggles
            start={!!shape.arrowStart}
            end={!!shape.arrowEnd}
            onChange={(start, end) => queueUpdate({ arrowStart: start, arrowEnd: end } as Partial<Shape>, 'arrows')}
          />
        </div>
      </section>
    </>
  )
}

interface ArrowTogglesProps {
  start: boolean
  end: boolean
  onChange: (start: boolean, end: boolean) => void
}

function ArrowToggles({ start, end, onChange }: ArrowTogglesProps) {
  return (
    <div className={styles.toggleGroup}>
      <button
        type="button"
        title="Arrow at start"
        aria-label="Arrow at start"
        className={start ? styles.toggleButtonActive : styles.toggleButton}
        onClick={() => onChange(!start, end)}
      >← Start</button>
      <button
        type="button"
        title="Arrow at end"
        aria-label="Arrow at end"
        className={end ? styles.toggleButtonActive : styles.toggleButton}
        onClick={() => onChange(start, !end)}
      >End →</button>
    </div>
  )
}

function BorderSection({ shape, queueUpdate }: SectionProps<RectangleShape | CircleShape | PolygonShape | PathShape>) {
  const currentWidth = shape.strokeWidth ?? 0

  // If user picks a visible border color while width is 0, bump width to 1
  // so the choice produces a visible result.
  const handleStrokeChange = (newStroke: string) => {
    const isVisible = newStroke && newStroke !== 'transparent' && newStroke !== '#ffffff00'
    const updates: Partial<Shape> = { stroke: newStroke } as Partial<Shape>
    if (isVisible && currentWidth === 0) {
      (updates as { strokeWidth?: number }).strokeWidth = 1
    }
    queueUpdate(updates, 'stroke')
  }

  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>Border</h3>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>Color</span>
        <ColorPicker value={shape.stroke || 'transparent'} allowTransparent
          onChange={handleStrokeChange} />
      </div>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>Width</span>
        <div className={styles.fieldControl}>
          <NumberInput value={currentWidth} min={0} max={50}
            onChange={(v) => queueUpdate({ strokeWidth: v } as Partial<Shape>, 'strokeWidth')} />
        </div>
      </div>
    </section>
  )
}

function TextSection({ shape, queueUpdate }: SectionProps<TextShape>) {
  return (
    <>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Text</h3>
        <DebouncedTextarea value={shape.text} placeholder="Enter text…"
          onChange={(v) => queueUpdate({ text: v } as Partial<Shape>, 'text')} />
      </section>
      <TypographySection
        fontSize={shape.fontSize}
        fontFamily={shape.fontFamily}
        textColor={shape.textColor}
        onFontSize={(v) => queueUpdate({ fontSize: v } as Partial<Shape>, 'fontSize')}
        onFontFamily={(v) => queueUpdate({ fontFamily: v } as Partial<Shape>, 'fontFamily')}
        onTextColor={(v) => queueUpdate({ textColor: v } as Partial<Shape>, 'textColor')}
      />
      <AlignmentSection
        align={shape.align ?? 'left'}
        verticalAlign={shape.verticalAlign ?? 'top'}
        onAlign={(v) => queueUpdate({ align: v } as Partial<Shape>, 'align')}
        onVerticalAlign={(v) => queueUpdate({ verticalAlign: v } as Partial<Shape>, 'valign')}
      />
    </>
  )
}

function StickySection({ shape, queueUpdate }: SectionProps<StickyNoteShape>) {
  return (
    <>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Note</h3>
        <DebouncedTextarea value={shape.text} placeholder="Note…"
          onChange={(v) => queueUpdate({ text: v } as Partial<Shape>, 'text')} />
      </section>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Size</h3>
        <div className={styles.row}>
          <NumberCell label="Width" value={Math.round(shape.width)} min={1}
            onChange={(v) => queueUpdate({ width: v } as Partial<Shape>, 'size')} />
          <NumberCell label="Height" value={Math.round(shape.height)} min={1}
            onChange={(v) => queueUpdate({ height: v } as Partial<Shape>, 'size')} />
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Font size</span>
          <div className={styles.fieldControl}>
            <NumberInput value={shape.fontSize} min={8} max={120}
              onChange={(v) => queueUpdate({ fontSize: v } as Partial<Shape>, 'fontSize')} />
          </div>
        </div>
      </section>
    </>
  )
}

function PolygonSection({ shape, queueUpdate }: SectionProps<PolygonShape>) {
  // Editing width/height proportionally scales the polygon's points so the
  // bounding box stays correct. Editing `sides` (for regular polygons)
  // regenerates the points as a fresh N-gon at the current width/height.
  const setWidth = (newW: number) => {
    const oldW = shape.width || 1
    const sx = newW / oldW
    if (shape.sides) {
      queueUpdate({ width: newW, points: regularPolygonPoints(newW, shape.height, shape.sides) } as Partial<Shape>, 'size')
    } else {
      const scaled = shape.points.map((v, i) => (i % 2 === 0 ? v * sx : v))
      queueUpdate({ width: newW, points: scaled } as Partial<Shape>, 'size')
    }
  }
  const setHeight = (newH: number) => {
    const oldH = shape.height || 1
    const sy = newH / oldH
    if (shape.sides) {
      queueUpdate({ height: newH, points: regularPolygonPoints(shape.width, newH, shape.sides) } as Partial<Shape>, 'size')
    } else {
      const scaled = shape.points.map((v, i) => (i % 2 === 0 ? v : v * sy))
      queueUpdate({ height: newH, points: scaled } as Partial<Shape>, 'size')
    }
  }
  const setSides = (n: number) => {
    const sides = Math.max(3, Math.min(24, Math.round(n)))
    queueUpdate({ sides, points: regularPolygonPoints(shape.width, shape.height, sides) } as Partial<Shape>, 'sides')
  }
  return (
    <>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Size</h3>
        <div className={styles.row}>
          <NumberCell label="Width" value={Math.round(shape.width)} min={1} onChange={setWidth} />
          <NumberCell label="Height" value={Math.round(shape.height)} min={1} onChange={setHeight} />
        </div>
        {shape.sides !== undefined ? (
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Sides</span>
            <div className={styles.fieldControl}>
              <NumberInput value={shape.sides} min={3} max={24} onChange={setSides} />
            </div>
          </div>
        ) : (
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Vertices</span>
            <span style={{ fontSize: 12, color: 'var(--color-gray-700)' }}>
              {Math.floor(shape.points.length / 2)} points (custom)
            </span>
          </div>
        )}
      </section>
      <BorderSection shape={shape} queueUpdate={queueUpdate} />
    </>
  )
}

function PathSection({ shape, queueUpdate }: SectionProps<PathShape>) {
  return (
    <>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Size</h3>
        <div className={styles.row}>
          <NumberCell label="Width" value={Math.round(shape.width)} min={1}
            onChange={(v) => queueUpdate({ width: v } as Partial<Shape>, 'size')} />
          <NumberCell label="Height" value={Math.round(shape.height)} min={1}
            onChange={(v) => queueUpdate({ height: v } as Partial<Shape>, 'size')} />
        </div>
      </section>
      <BorderSection shape={shape} queueUpdate={queueUpdate} />
    </>
  )
}

/**
 * Unified text section for rect / circle / polygon. Shows the full
 * typography stack (content, font, size, color, alignment) so any shape
 * can be authored as if it were a text frame.
 */
function ShapeTextSection({ shape, queueUpdate }: SectionProps<Shape>) {
  const content = shape.text ?? shape.label ?? ''
  const fontSize = shape.fontSize ?? shape.labelFontSize ?? 16
  const fontFamily = shape.fontFamily ?? 'Inter'
  const textColor = shape.textColor ?? shape.labelColor ?? '#374151'
  const align = shape.align ?? 'center'
  const verticalAlign = shape.verticalAlign ?? 'middle'

  return (
    <>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Text</h3>
        <DebouncedTextarea value={content} placeholder="Add text…"
          onChange={(v) => queueUpdate({ text: v }, 'text')} />
      </section>
      {content && (
        <>
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Typography</h3>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Family</span>
              <div className={styles.fieldControl}>
                <select className={styles.select} value={fontFamily}
                  onChange={(e) => queueUpdate({ fontFamily: e.target.value }, 'fontFamily')}
                  style={{ fontFamily }}>
                  {['Inter', 'Arial', 'Helvetica', 'Times New Roman', 'Courier New', 'Georgia', 'Verdana'].map(f => (
                    <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Size</span>
              <div className={styles.fieldControl}>
                <NumberInput value={fontSize} min={8} max={200}
                  onChange={(v) => queueUpdate({ fontSize: v }, 'fontSize')} />
              </div>
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Color</span>
              <ColorPicker value={textColor}
                onChange={(v) => queueUpdate({ textColor: v }, 'textColor')} />
            </div>
          </section>
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Alignment</h3>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Horizontal</span>
              <IconSegmented
                value={align}
                options={[
                  { value: 'left', icon: <AlignLeft size={14} />, title: 'Left' },
                  { value: 'center', icon: <AlignCenter size={14} />, title: 'Center' },
                  { value: 'right', icon: <AlignRight size={14} />, title: 'Right' },
                ]}
                onChange={(v) => queueUpdate({ align: v as 'left' | 'center' | 'right' }, 'align')}
              />
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Vertical</span>
              <IconSegmented
                value={verticalAlign}
                options={[
                  { value: 'top', icon: <AlignVerticalJustifyStart size={14} />, title: 'Top' },
                  { value: 'middle', icon: <AlignVerticalJustifyCenter size={14} />, title: 'Middle' },
                  { value: 'bottom', icon: <AlignVerticalJustifyEnd size={14} />, title: 'Bottom' },
                ]}
                onChange={(v) => queueUpdate({ verticalAlign: v as 'top' | 'middle' | 'bottom' }, 'verticalAlign')}
              />
            </div>
          </section>
        </>
      )}
    </>
  )
}

interface TypographySectionProps {
  fontSize: number
  fontFamily: string
  textColor: string
  onFontSize: (v: number) => void
  onFontFamily: (v: string) => void
  onTextColor: (v: string) => void
}

function TypographySection({
  fontSize, fontFamily, textColor, onFontSize, onFontFamily, onTextColor,
}: TypographySectionProps) {
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>Typography</h3>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>Family</span>
        <div className={styles.fieldControl}>
          <select className={styles.select} value={fontFamily}
            onChange={(e) => onFontFamily(e.target.value)}
            style={{ fontFamily }}>
            {FONT_FAMILIES.map(f => (
              <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
            ))}
          </select>
        </div>
      </div>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>Size</span>
        <div className={styles.fieldControl}>
          <NumberInput value={fontSize} min={8} max={200} onChange={onFontSize} />
        </div>
      </div>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>Color</span>
        <ColorPicker value={textColor} onChange={onTextColor} />
      </div>
    </section>
  )
}

interface AlignmentSectionProps {
  align: NonNullable<TextShape['align']>
  verticalAlign: NonNullable<TextShape['verticalAlign']>
  onAlign: (v: TextShape['align']) => void
  onVerticalAlign: (v: TextShape['verticalAlign']) => void
}

function AlignmentSection({ align, verticalAlign, onAlign, onVerticalAlign }: AlignmentSectionProps) {
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>Alignment</h3>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>Horizontal</span>
        <IconSegmented
          value={align}
          options={[
            { value: 'left', icon: <AlignLeft size={14} />, title: 'Left' },
            { value: 'center', icon: <AlignCenter size={14} />, title: 'Center' },
            { value: 'right', icon: <AlignRight size={14} />, title: 'Right' },
          ]}
          onChange={(v) => onAlign(v as TextShape['align'])}
        />
      </div>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>Vertical</span>
        <IconSegmented
          value={verticalAlign}
          options={[
            { value: 'top', icon: <AlignVerticalJustifyStart size={14} />, title: 'Top' },
            { value: 'middle', icon: <AlignVerticalJustifyCenter size={14} />, title: 'Middle' },
            { value: 'bottom', icon: <AlignVerticalJustifyEnd size={14} />, title: 'Bottom' },
          ]}
          onChange={(v) => onVerticalAlign(v as TextShape['verticalAlign'])}
        />
      </div>
    </section>
  )
}

// ============================================================================
// Field primitives
// ============================================================================

interface NumberInputProps {
  value: number
  min?: number
  max?: number
  onChange: (value: number) => void
}

function NumberInput({ value, min, max, onChange }: NumberInputProps) {
  // Local string buffer for typing partial values (e.g. "-") without parseFloat
  // clobbering keystrokes. Resets when upstream value actually changes.
  const [draft, setDraft] = useState({ src: value, str: String(value) })
  if (draft.src !== value) setDraft({ src: value, str: String(value) })

  const commit = (raw: string) => {
    const num = parseFloat(raw)
    if (!Number.isFinite(num)) return
    let clamped = num
    if (min !== undefined) clamped = Math.max(min, clamped)
    if (max !== undefined) clamped = Math.min(max, clamped)
    onChange(clamped)
  }

  return (
    <input
      type="number"
      className={styles.input}
      value={draft.str}
      min={min}
      max={max}
      onChange={(e) => { setDraft({ src: value, str: e.target.value }); commit(e.target.value) }}
      onBlur={() => setDraft({ src: value, str: String(value) })}
    />
  )
}

interface NumberCellProps extends NumberInputProps {
  label: string
}

function NumberCell({ label, ...rest }: NumberCellProps) {
  return (
    <div className={styles.rowCell}>
      <span className={styles.miniLabel}>{label}</span>
      <NumberInput {...rest} />
    </div>
  )
}

interface ColorPickerProps {
  value: string
  allowTransparent?: boolean
  onChange: (value: string) => void
}

function ColorPicker({ value, allowTransparent, onChange }: ColorPickerProps) {
  const [draft, setDraft] = useState({ src: value, str: value })
  if (draft.src !== value) setDraft({ src: value, str: value })

  const isTransparent = !value || value === 'transparent'

  return (
    <div className={styles.colorRow}>
      <span className={styles.colorSwatch} title={allowTransparent ? 'Click to pick color' : undefined}>
        {!isTransparent && (
          <span className={styles.swatchInner} style={{ background: value }} />
        )}
        <input
          type="color"
          className={styles.colorInput}
          value={colorToHex(value)}
          onChange={(e) => { setDraft({ src: value, str: e.target.value }); onChange(e.target.value) }}
        />
      </span>
      <input
        type="text"
        className={styles.hexInput}
        value={draft.str}
        placeholder={allowTransparent ? 'transparent' : '#000000'}
        onChange={(e) => { setDraft({ src: value, str: e.target.value }); onChange(e.target.value) }}
        onBlur={() => setDraft({ src: value, str: value })}
      />
    </div>
  )
}

interface IconSegmentedProps {
  value: string
  options: { value: string; icon: React.ReactNode; title: string }[]
  onChange: (value: string) => void
}

function IconSegmented({ value, options, onChange }: IconSegmentedProps) {
  return (
    <div className={styles.toggleGroup}>
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          title={opt.title}
          aria-label={opt.title}
          className={value === opt.value ? styles.toggleButtonActive : styles.toggleButton}
          onClick={() => onChange(opt.value)}
        >{opt.icon}</button>
      ))}
    </div>
  )
}


interface DebouncedTextareaProps {
  value: string
  placeholder?: string
  onChange: (value: string) => void
}

function DebouncedTextarea({ value, placeholder, onChange }: DebouncedTextareaProps) {
  const [draft, setDraft] = useState({ src: value, str: value })
  if (draft.src !== value) setDraft({ src: value, str: value })
  return (
    <textarea
      className={styles.textArea}
      value={draft.str}
      placeholder={placeholder}
      onChange={(e) => { setDraft({ src: value, str: e.target.value }); onChange(e.target.value) }}
      onBlur={() => setDraft({ src: value, str: value })}
    />
  )
}
