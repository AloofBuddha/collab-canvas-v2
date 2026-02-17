/**
 * Shape Factory - Centralized shape creation and manipulation
 *
 * Ported from V1, adapted for V2 (Yjs-backed, no Firebase deps).
 * Added sticky note support.
 */

import type { Shape, RectangleShape, CircleShape, LineShape, TextShape, StickyNoteShape } from '../types'

// ============================================================================
// Shape Name Generation
// ============================================================================

const shapeCounters: Record<string, number> = {
  rectangle: 0,
  circle: 0,
  line: 0,
  text: 0,
  sticky: 0,
}

export function generateShapeName(type: string): string {
  shapeCounters[type] = (shapeCounters[type] || 0) + 1
  return `${type}-${shapeCounters[type]}`
}

// ============================================================================
// Shape Type Registry
// ============================================================================

export interface ShapeTypeConfig {
  displayName: string
  getDefaultProps: (x: number, y: number, userId: string) => Partial<Shape>
  updateCreationProps: (shape: Shape, mouseX: number, mouseY: number) => Partial<Shape>
  getDimensions: (shape: Shape) => { width: number; height: number }
  getCenter: (shape: Shape) => { x: number; y: number }
  getBounds: (shape: Shape) => { x: number; y: number; width: number; height: number }
  formatDimensions: (shape: Shape) => string
  hasMinimumSize: (shape: Shape, minSize: number) => boolean
  normalize: (shape: Shape) => Shape
}

const shapeTypeRegistry: Record<string, ShapeTypeConfig> = {
  rectangle: {
    displayName: 'Rectangle',
    getDefaultProps: (x, y, userId) => ({
      type: 'rectangle',
      name: generateShapeName('rectangle'),
      x,
      y,
      width: 0,
      height: 0,
      color: '#D1D5DB',
      opacity: 1.0,
      zIndex: Date.now(),
      createdBy: userId,
    }),
    updateCreationProps: (shape, mouseX, mouseY) => ({
      width: mouseX - shape.x,
      height: mouseY - shape.y,
    }),
    getDimensions: (shape) => {
      const rect = shape as RectangleShape
      return { width: rect.width, height: rect.height }
    },
    getCenter: (shape) => {
      const rect = shape as RectangleShape
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
    },
    getBounds: (shape) => {
      const rect = shape as RectangleShape
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    },
    formatDimensions: (shape) => {
      const rect = shape as RectangleShape
      return `${Math.round(rect.width)} × ${Math.round(rect.height)}`
    },
    hasMinimumSize: (shape, minSize) => {
      const rect = shape as RectangleShape
      return Math.abs(rect.width) > minSize && Math.abs(rect.height) > minSize
    },
    normalize: (shape) => {
      const rect = shape as RectangleShape
      return {
        ...rect,
        x: rect.width < 0 ? rect.x + rect.width : rect.x,
        y: rect.height < 0 ? rect.y + rect.height : rect.y,
        width: Math.abs(rect.width),
        height: Math.abs(rect.height),
      } as RectangleShape
    },
  },

  circle: {
    displayName: 'Circle',
    getDefaultProps: (x, y, userId) => ({
      type: 'circle',
      name: generateShapeName('circle'),
      x,
      y,
      radiusX: 0,
      radiusY: 0,
      color: '#D1D5DB',
      opacity: 1.0,
      zIndex: Date.now(),
      createdBy: userId,
    }),
    updateCreationProps: (shape, mouseX, mouseY) => {
      const width = mouseX - shape.x
      const height = mouseY - shape.y
      return {
        radiusX: width / 2,
        radiusY: height / 2,
      }
    },
    getDimensions: (shape) => {
      const circle = shape as CircleShape
      return { width: circle.radiusX * 2, height: circle.radiusY * 2 }
    },
    getCenter: (shape) => {
      const circle = shape as CircleShape
      return { x: circle.x + circle.radiusX, y: circle.y + circle.radiusY }
    },
    getBounds: (shape) => {
      const circle = shape as CircleShape
      return {
        x: circle.x,
        y: circle.y,
        width: circle.radiusX * 2,
        height: circle.radiusY * 2,
      }
    },
    formatDimensions: (shape) => {
      const circle = shape as CircleShape
      return `${Math.round(circle.radiusX)} × ${Math.round(circle.radiusY)}`
    },
    hasMinimumSize: (shape, minSize) => {
      const circle = shape as CircleShape
      return Math.abs(circle.radiusX) > minSize && Math.abs(circle.radiusY) > minSize
    },
    normalize: (shape) => {
      const circle = shape as CircleShape
      const width = circle.radiusX * 2
      const height = circle.radiusY * 2
      return {
        ...circle,
        x: width < 0 ? circle.x + width : circle.x,
        y: height < 0 ? circle.y + height : circle.y,
        radiusX: Math.abs(circle.radiusX),
        radiusY: Math.abs(circle.radiusY),
      } as CircleShape
    },
  },

  line: {
    displayName: 'Line',
    getDefaultProps: (x, y, userId) => ({
      type: 'line',
      name: generateShapeName('line'),
      x,
      y,
      x2: x,
      y2: y,
      strokeWidth: 4,
      color: '#D1D5DB',
      opacity: 1.0,
      zIndex: Date.now(),
      createdBy: userId,
    }),
    updateCreationProps: (_shape, mouseX, mouseY) => ({
      x2: mouseX,
      y2: mouseY,
    }),
    getDimensions: (shape) => {
      const line = shape as LineShape
      return {
        width: Math.abs(line.x2 - line.x),
        height: Math.abs(line.y2 - line.y),
      }
    },
    getCenter: (shape) => {
      const line = shape as LineShape
      return {
        x: (line.x + line.x2) / 2,
        y: (line.y + line.y2) / 2,
      }
    },
    getBounds: (shape) => {
      const line = shape as LineShape
      const minX = Math.min(line.x, line.x2)
      const minY = Math.min(line.y, line.y2)
      const maxX = Math.max(line.x, line.x2)
      const maxY = Math.max(line.y, line.y2)
      return {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
      }
    },
    formatDimensions: (shape) => {
      const line = shape as LineShape
      const length = Math.sqrt(Math.pow(line.x2 - line.x, 2) + Math.pow(line.y2 - line.y, 2))
      return `${Math.round(length)}px`
    },
    hasMinimumSize: (shape, minSize) => {
      const line = shape as LineShape
      const length = Math.sqrt(Math.pow(line.x2 - line.x, 2) + Math.pow(line.y2 - line.y, 2))
      return length > minSize
    },
    normalize: (shape) => {
      return shape as LineShape
    },
  },

  text: {
    displayName: 'Text',
    getDefaultProps: (x, y, userId) => ({
      type: 'text',
      name: generateShapeName('text'),
      x,
      y,
      width: 0,
      height: 0,
      text: 'Text',
      fontSize: 16,
      fontFamily: 'Arial',
      textColor: '#000000',
      color: 'transparent',
      opacity: 1.0,
      zIndex: Date.now(),
      align: 'left' as const,
      verticalAlign: 'top' as const,
      createdBy: userId,
    }),
    updateCreationProps: (shape, mouseX, mouseY) => ({
      width: mouseX - shape.x,
      height: mouseY - shape.y,
    }),
    getDimensions: (shape) => {
      const text = shape as TextShape
      return { width: text.width, height: text.height }
    },
    getCenter: (shape) => {
      const text = shape as TextShape
      return {
        x: text.x + text.width / 2,
        y: text.y + text.height / 2,
      }
    },
    getBounds: (shape) => {
      const text = shape as TextShape
      return {
        x: text.x,
        y: text.y,
        width: text.width,
        height: text.height,
      }
    },
    formatDimensions: (shape) => {
      const text = shape as TextShape
      return `${Math.round(text.width)} × ${Math.round(text.height)}`
    },
    hasMinimumSize: (shape, minSize) => {
      const text = shape as TextShape
      return Math.abs(text.width) > minSize && Math.abs(text.height) > minSize
    },
    normalize: (shape) => {
      const text = shape as TextShape
      return {
        ...text,
        x: text.width < 0 ? text.x + text.width : text.x,
        y: text.height < 0 ? text.y + text.height : text.y,
        width: Math.abs(text.width),
        height: Math.abs(text.height),
      } as TextShape
    },
  },

  sticky: {
    displayName: 'Sticky Note',
    getDefaultProps: (x, y, userId) => ({
      type: 'sticky',
      name: generateShapeName('sticky'),
      x,
      y,
      width: 0,
      height: 0,
      text: '',
      fontSize: 16,
      color: '#FEF3C7',
      opacity: 1.0,
      zIndex: Date.now(),
      createdBy: userId,
    }),
    updateCreationProps: (shape, mouseX, mouseY) => ({
      width: mouseX - shape.x,
      height: mouseY - shape.y,
    }),
    getDimensions: (shape) => {
      const sticky = shape as StickyNoteShape
      return { width: sticky.width, height: sticky.height }
    },
    getCenter: (shape) => {
      const sticky = shape as StickyNoteShape
      return {
        x: sticky.x + sticky.width / 2,
        y: sticky.y + sticky.height / 2,
      }
    },
    getBounds: (shape) => {
      const sticky = shape as StickyNoteShape
      return {
        x: sticky.x,
        y: sticky.y,
        width: sticky.width,
        height: sticky.height,
      }
    },
    formatDimensions: (shape) => {
      const sticky = shape as StickyNoteShape
      return `${Math.round(sticky.width)} × ${Math.round(sticky.height)}`
    },
    hasMinimumSize: (shape, minSize) => {
      const sticky = shape as StickyNoteShape
      return Math.abs(sticky.width) > minSize && Math.abs(sticky.height) > minSize
    },
    normalize: (shape) => {
      const sticky = shape as StickyNoteShape
      return {
        ...sticky,
        x: sticky.width < 0 ? sticky.x + sticky.width : sticky.x,
        y: sticky.height < 0 ? sticky.y + sticky.height : sticky.y,
        width: Math.abs(sticky.width),
        height: Math.abs(sticky.height),
      } as StickyNoteShape
    },
  },
}

// ============================================================================
// Public API
// ============================================================================

export function createShape(
  type: string,
  x: number,
  y: number,
  userId: string,
): Shape {
  const config = shapeTypeRegistry[type]
  if (!config) {
    throw new Error(`Unknown shape type: ${type}`)
  }

  const id = crypto.randomUUID()
  const defaultProps = config.getDefaultProps(x, y, userId)

  return { id, ...defaultProps } as Shape
}

export function updateShapeCreation(
  shape: Shape,
  mouseX: number,
  mouseY: number,
): Shape {
  const config = shapeTypeRegistry[shape.type]
  if (!config) return shape

  const updates = config.updateCreationProps(shape, mouseX, mouseY)
  return { ...shape, ...updates } as Shape
}

export function getShapeDimensions(shape: Shape): { width: number; height: number } {
  const config = shapeTypeRegistry[shape.type]
  if (!config) return { width: 0, height: 0 }
  return config.getDimensions(shape)
}

export function getShapeCenter(shape: Shape): { x: number; y: number } {
  const config = shapeTypeRegistry[shape.type]
  if (!config) return { x: shape.x, y: shape.y }
  return config.getCenter(shape)
}

export function getShapeBounds(shape: Shape): { x: number; y: number; width: number; height: number } {
  const config = shapeTypeRegistry[shape.type]
  if (!config) return { x: shape.x, y: shape.y, width: 0, height: 0 }
  return config.getBounds(shape)
}

export function formatShapeDimensions(shape: Shape): string {
  const config = shapeTypeRegistry[shape.type]
  if (!config) return '0 × 0'
  return config.formatDimensions(shape)
}

export function hasShapeMinimumSize(shape: Shape, minSize: number): boolean {
  const config = shapeTypeRegistry[shape.type]
  if (!config) return false
  return config.hasMinimumSize(shape, minSize)
}

export function normalizeShape(shape: Shape): Shape {
  const config = shapeTypeRegistry[shape.type]
  if (!config) return shape
  return config.normalize(shape)
}

export function getSupportedShapeTypes(): string[] {
  return Object.keys(shapeTypeRegistry)
}

export function getShapeTypeConfig(type: string): ShapeTypeConfig | null {
  return shapeTypeRegistry[type] || null
}
