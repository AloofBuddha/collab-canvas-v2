import { describe, it, expect } from 'vitest'
import {
  createShape,
  updateShapeCreation,
  normalizeShape,
  hasShapeMinimumSize,
  getSupportedShapeTypes,
} from '../../src/utils/shapeFactory'
import type { RectangleShape, CircleShape, LineShape } from '../../src/types'

describe('shapeFactory', () => {
  // Shape factory is the single source of truth for shape creation.
  // Worth testing because incorrect defaults = shapes render wrong,
  // and normalization bugs cause negative-dimension shapes.

  describe('createShape', () => {
    it('generates unique IDs per shape', () => {
      const a = createShape('rectangle', 0, 0, 'u')
      const b = createShape('rectangle', 0, 0, 'u')
      expect(a.id).not.toBe(b.id)
    })

    it('throws for unknown shape type', () => {
      expect(() => createShape('hexagon', 0, 0, 'u')).toThrow('Unknown shape type')
    })

    it('supports all 5 shape types', () => {
      expect(getSupportedShapeTypes()).toEqual(
        expect.arrayContaining(['rectangle', 'circle', 'line', 'text', 'sticky'])
      )
    })
  })

  describe('updateShapeCreation', () => {
    // This is called on every mousemove during drag-to-create.
    // If it breaks, shape preview doesn't follow the cursor.

    it('updates rectangle dimensions from mouse position', () => {
      const shape = createShape('rectangle', 100, 100, 'u')
      const updated = updateShapeCreation(shape, 300, 250) as RectangleShape
      expect(updated.width).toBe(200)
      expect(updated.height).toBe(150)
    })

    it('updates circle radii from mouse position', () => {
      const shape = createShape('circle', 100, 100, 'u')
      const updated = updateShapeCreation(shape, 300, 300) as CircleShape
      expect(updated.radiusX).toBe(100) // (300-100)/2
      expect(updated.radiusY).toBe(100)
    })

    it('updates line endpoint from mouse position', () => {
      const shape = createShape('line', 10, 10, 'u')
      const updated = updateShapeCreation(shape, 200, 300) as LineShape
      expect(updated.x2).toBe(200)
      expect(updated.y2).toBe(300)
    })
  })

  describe('normalizeShape', () => {
    // Normalization fixes negative dimensions from dragging "backwards"
    // (right-to-left or bottom-to-top). Without this, shapes have
    // negative width/height and render at wrong positions.

    it('flips rectangle with negative width (dragged right-to-left)', () => {
      const shape: RectangleShape = {
        id: '1', type: 'rectangle', x: 300, y: 100, width: -200, height: 100, color: '#000', createdBy: 'u',
      }
      const normalized = normalizeShape(shape) as RectangleShape
      expect(normalized.x).toBe(100)
      expect(normalized.width).toBe(200)
    })

    it('flips rectangle with negative height (dragged bottom-to-top)', () => {
      const shape: RectangleShape = {
        id: '1', type: 'rectangle', x: 100, y: 300, width: 200, height: -200, color: '#000', createdBy: 'u',
      }
      const normalized = normalizeShape(shape) as RectangleShape
      expect(normalized.y).toBe(100)
      expect(normalized.height).toBe(200)
    })

    it('does not modify lines (lines have no "negative" direction)', () => {
      const shape: LineShape = {
        id: '1', type: 'line', x: 100, y: 200, x2: 50, y2: 100, strokeWidth: 2, color: '#000', createdBy: 'u',
      }
      const normalized = normalizeShape(shape) as LineShape
      expect(normalized.x).toBe(100)
      expect(normalized.x2).toBe(50)
    })
  })

  describe('hasShapeMinimumSize', () => {
    // Prevents accidental clicks from creating invisible micro-shapes.
    // Without this, clicking without dragging creates a 0x0 shape.

    it('rejects shapes smaller than minimum', () => {
      const tiny: RectangleShape = {
        id: '1', type: 'rectangle', x: 0, y: 0, width: 3, height: 3, color: '#000', createdBy: 'u',
      }
      expect(hasShapeMinimumSize(tiny, 5)).toBe(false)
    })

    it('accepts shapes larger than minimum', () => {
      const big: RectangleShape = {
        id: '1', type: 'rectangle', x: 0, y: 0, width: 50, height: 50, color: '#000', createdBy: 'u',
      }
      expect(hasShapeMinimumSize(big, 5)).toBe(true)
    })
  })
})
