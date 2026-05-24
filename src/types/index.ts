/**
 * Type definitions for CollabCanvas V2
 */

// ============================================================================
// Shape Types
// ============================================================================

interface BaseShape {
  id: string
  name?: string
  x: number
  y: number
  rotation?: number
  opacity?: number
  zIndex?: number
  color: string
  createdBy: string
  /** Centered display text. Replaces the old `label` field for new shapes;
   *  rendering supports rect / circle / polygon. */
  text?: string
  fontSize?: number
  fontFamily?: string
  textColor?: string
  align?: 'left' | 'center' | 'right'
  verticalAlign?: 'top' | 'middle' | 'bottom'
  /** Deprecated — kept so existing data continues to render. Treat as a
   *  fallback for `text` when text is absent. */
  label?: string
  labelFontSize?: number
  labelColor?: string
  /** Shapes sharing the same groupId are selected and manipulated together. */
  groupId?: string
}

export interface RectangleShape extends BaseShape {
  type: 'rectangle'
  width: number
  height: number
  stroke?: string
  strokeWidth?: number
  /** Corner radius in px (rounded corners). Defaults to 0 (sharp). */
  cornerRadius?: number
}

export interface CircleShape extends BaseShape {
  type: 'circle'
  radiusX: number
  radiusY: number
  stroke?: string
  strokeWidth?: number
}

export interface LineShape extends BaseShape {
  type: 'line'
  x2: number
  y2: number
  strokeWidth: number
  arrowStart?: boolean
  arrowEnd?: boolean
}

export interface TextShape extends BaseShape {
  type: 'text'
  text: string
  fontSize: number
  fontFamily: string
  textColor: string
  width: number
  height: number
  align?: 'left' | 'center' | 'right'
  verticalAlign?: 'top' | 'middle' | 'bottom'
}

export interface StickyNoteShape extends BaseShape {
  type: 'sticky'
  text: string
  width: number
  height: number
  fontSize: number
}

/**
 * Polygon — a closed shape defined by a flat list of vertex coordinates,
 * all stored relative to (x, y). Width/height is the bounding box of the
 * point set (cached so multi-select math doesn't have to walk points).
 */
export interface PolygonShape extends BaseShape {
  type: 'polygon'
  /** Flat array of vertex coords: [x1, y1, x2, y2, ...]. Always auto-closed at render. */
  points: number[]
  width: number
  height: number
  stroke?: string
  strokeWidth?: number
  /** When present, the polygon is a regular N-gon and resize/sides edits in
   *  the SidePanel regenerate points from this count + bbox. Absent for
   *  AI-authored irregular polygons (which carry hand-placed points). */
  sides?: number
}

/**
 * Path — an SVG-style path (a subset: M, L, Q, C, Z). Coords in d are in
 * [0, width] × [0, height], i.e. local to the shape's bounding box.
 */
export interface PathShape extends BaseShape {
  type: 'path'
  /** SVG path data. Supported commands: M, L, Q, C, Z (and lowercase variants).
   *  Coords are in [0..viewBoxWidth, 0..viewBoxHeight] LOCAL space. */
  d: string
  /** Rendered size. May differ from viewBox after resize — the path stretches
   *  via scaleX/scaleY at render time so we never have to parse SVG. */
  width: number
  height: number
  /** Original local-coord space of `d`. Captured at creation and never changed
   *  by resize. Defaults to width/height at creation if omitted. */
  viewBoxWidth?: number
  viewBoxHeight?: number
  stroke?: string
  strokeWidth?: number
}

export type Shape =
  | RectangleShape
  | CircleShape
  | LineShape
  | TextShape
  | StickyNoteShape
  | PolygonShape
  | PathShape

export type ShapeType = Shape['type']

export type Tool = 'select' | 'rectangle' | 'circle' | 'polygon' | 'line' | 'path' | 'pen' | 'text' | 'sticky'

// ============================================================================
// User Types
// ============================================================================

export type AuthStatus = 'authenticated' | 'unauthenticated' | 'loading'

export interface User {
  userId: string
  displayName: string
  color: string
}

// ============================================================================
// Cursor Types
// ============================================================================

export interface Cursor {
  x: number
  y: number
}

export interface RemoteCursor extends Cursor {
  userId: string
  color: string
  name: string
}
