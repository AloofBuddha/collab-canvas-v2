import { describe, it, expect } from 'vitest'
import {
  createShape,
  updateShapeCreation,
  getShapeDimensions,
  getShapeCenter,
  getShapeBounds,
  hasShapeMinimumSize,
  normalizeShape,
  getSupportedShapeTypes,
} from '../../src/utils/shapeFactory'
import type { RectangleShape, CircleShape, LineShape, TextShape, StickyNoteShape } from '../../src/types'

describe('shapeFactory', () => {
  describe('createShape', () => {
    it('should create a rectangle with correct defaults', () => {
      const shape = createShape('rectangle', 100, 200, 'user-1')
      expect(shape.id).toBeDefined()
      expect(shape.type).toBe('rectangle')
      expect(shape.x).toBe(100)
      expect(shape.y).toBe(200)
      expect(shape.createdBy).toBe('user-1')
      const rect = shape as RectangleShape
      expect(rect.width).toBe(0)
      expect(rect.height).toBe(0)
    })

    it('should create a circle with correct defaults', () => {
      const shape = createShape('circle', 50, 75, 'user-2')
      expect(shape.type).toBe('circle')
      const circle = shape as CircleShape
      expect(circle.radiusX).toBe(0)
      expect(circle.radiusY).toBe(0)
    })

    it('should create a line with correct defaults', () => {
      const shape = createShape('line', 10, 20, 'user-1')
      expect(shape.type).toBe('line')
      const line = shape as LineShape
      expect(line.x).toBe(10)
      expect(line.y).toBe(20)
      expect(line.x2).toBe(10)
      expect(line.y2).toBe(20)
      expect(line.strokeWidth).toBe(4)
    })

    it('should create a text shape with correct defaults', () => {
      const shape = createShape('text', 0, 0, 'user-1')
      expect(shape.type).toBe('text')
      const text = shape as TextShape
      expect(text.text).toBe('Text')
      expect(text.fontSize).toBe(16)
      expect(text.fontFamily).toBe('Arial')
    })

    it('should create a sticky note with correct defaults', () => {
      const shape = createShape('sticky', 100, 100, 'user-1')
      expect(shape.type).toBe('sticky')
      const sticky = shape as StickyNoteShape
      expect(sticky.color).toBe('#FEF3C7')
      expect(sticky.fontSize).toBe(16)
      expect(sticky.text).toBe('')
    })

    it('should generate unique IDs for each shape', () => {
      const shape1 = createShape('rectangle', 0, 0, 'user-1')
      const shape2 = createShape('rectangle', 0, 0, 'user-1')
      expect(shape1.id).not.toBe(shape2.id)
    })

    it('should throw for unknown shape type', () => {
      expect(() => createShape('unknown', 0, 0, 'user-1')).toThrow('Unknown shape type: unknown')
    })
  })

  describe('updateShapeCreation', () => {
    it('should update rectangle dimensions during creation', () => {
      const shape = createShape('rectangle', 100, 100, 'user-1')
      const updated = updateShapeCreation(shape, 300, 250) as RectangleShape
      expect(updated.width).toBe(200)
      expect(updated.height).toBe(150)
    })

    it('should update circle radii during creation', () => {
      const shape = createShape('circle', 100, 100, 'user-1')
      const updated = updateShapeCreation(shape, 300, 300) as CircleShape
      expect(updated.radiusX).toBe(100)
      expect(updated.radiusY).toBe(100)
    })

    it('should update line endpoint during creation', () => {
      const shape = createShape('line', 10, 10, 'user-1')
      const updated = updateShapeCreation(shape, 200, 300) as LineShape
      expect(updated.x2).toBe(200)
      expect(updated.y2).toBe(300)
    })
  })

  describe('getShapeDimensions', () => {
    it('should return rectangle dimensions', () => {
      const shape = createShape('rectangle', 0, 0, 'user-1')
      const updated = updateShapeCreation(shape, 100, 50) as RectangleShape
      const dims = getShapeDimensions(updated)
      expect(dims.width).toBe(100)
      expect(dims.height).toBe(50)
    })

    it('should return circle dimensions as diameter', () => {
      const shape = createShape('circle', 0, 0, 'user-1')
      const updated = updateShapeCreation(shape, 100, 80) as CircleShape
      const dims = getShapeDimensions(updated)
      expect(dims.width).toBe(100)
      expect(dims.height).toBe(80)
    })
  })

  describe('getShapeCenter', () => {
    it('should calculate rectangle center', () => {
      const shape: RectangleShape = {
        id: '1', type: 'rectangle', x: 100, y: 100, width: 200, height: 100, color: '#000', createdBy: 'u',
      }
      const center = getShapeCenter(shape)
      expect(center.x).toBe(200)
      expect(center.y).toBe(150)
    })

    it('should calculate line center', () => {
      const shape: LineShape = {
        id: '1', type: 'line', x: 0, y: 0, x2: 100, y2: 100, strokeWidth: 2, color: '#000', createdBy: 'u',
      }
      const center = getShapeCenter(shape)
      expect(center.x).toBe(50)
      expect(center.y).toBe(50)
    })
  })

  describe('getShapeBounds', () => {
    it('should return rectangle bounds', () => {
      const shape: RectangleShape = {
        id: '1', type: 'rectangle', x: 50, y: 75, width: 200, height: 100, color: '#000', createdBy: 'u',
      }
      const bounds = getShapeBounds(shape)
      expect(bounds).toEqual({ x: 50, y: 75, width: 200, height: 100 })
    })

    it('should return line bounds from min/max coordinates', () => {
      const shape: LineShape = {
        id: '1', type: 'line', x: 100, y: 200, x2: 50, y2: 100, strokeWidth: 2, color: '#000', createdBy: 'u',
      }
      const bounds = getShapeBounds(shape)
      expect(bounds.x).toBe(50)
      expect(bounds.y).toBe(100)
      expect(bounds.width).toBe(50)
      expect(bounds.height).toBe(100)
    })
  })

  describe('normalizeShape', () => {
    it('should flip rectangle with negative width', () => {
      const shape: RectangleShape = {
        id: '1', type: 'rectangle', x: 300, y: 100, width: -200, height: 100, color: '#000', createdBy: 'u',
      }
      const normalized = normalizeShape(shape) as RectangleShape
      expect(normalized.x).toBe(100)
      expect(normalized.width).toBe(200)
    })

    it('should flip rectangle with negative height', () => {
      const shape: RectangleShape = {
        id: '1', type: 'rectangle', x: 100, y: 300, width: 200, height: -200, color: '#000', createdBy: 'u',
      }
      const normalized = normalizeShape(shape) as RectangleShape
      expect(normalized.y).toBe(100)
      expect(normalized.height).toBe(200)
    })

    it('should not modify line shapes', () => {
      const shape: LineShape = {
        id: '1', type: 'line', x: 100, y: 200, x2: 50, y2: 100, strokeWidth: 2, color: '#000', createdBy: 'u',
      }
      const normalized = normalizeShape(shape) as LineShape
      expect(normalized.x).toBe(100)
      expect(normalized.x2).toBe(50)
    })
  })

  describe('hasShapeMinimumSize', () => {
    it('should return true for shapes larger than minimum', () => {
      const shape: RectangleShape = {
        id: '1', type: 'rectangle', x: 0, y: 0, width: 50, height: 50, color: '#000', createdBy: 'u',
      }
      expect(hasShapeMinimumSize(shape, 5)).toBe(true)
    })

    it('should return false for shapes smaller than minimum', () => {
      const shape: RectangleShape = {
        id: '1', type: 'rectangle', x: 0, y: 0, width: 3, height: 3, color: '#000', createdBy: 'u',
      }
      expect(hasShapeMinimumSize(shape, 5)).toBe(false)
    })

    it('should check line length against minimum', () => {
      const shape: LineShape = {
        id: '1', type: 'line', x: 0, y: 0, x2: 1, y2: 1, strokeWidth: 2, color: '#000', createdBy: 'u',
      }
      expect(hasShapeMinimumSize(shape, 5)).toBe(false)
    })
  })

  describe('getSupportedShapeTypes', () => {
    it('should return all 5 shape types', () => {
      const types = getSupportedShapeTypes()
      expect(types).toContain('rectangle')
      expect(types).toContain('circle')
      expect(types).toContain('line')
      expect(types).toContain('text')
      expect(types).toContain('sticky')
      expect(types).toHaveLength(5)
    })
  })
})
