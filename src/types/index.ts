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
  label?: string
  labelFontSize?: number
  labelColor?: string
}

export interface RectangleShape extends BaseShape {
  type: 'rectangle'
  width: number
  height: number
  stroke?: string
  strokeWidth?: number
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

export type Shape = RectangleShape | CircleShape | LineShape | TextShape | StickyNoteShape

export type ShapeType = Shape['type']

export type Tool = 'select' | 'rectangle' | 'circle' | 'line' | 'text' | 'sticky'

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
