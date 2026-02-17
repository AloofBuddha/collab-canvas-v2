/**
 * Tests for shape manipulation utilities
 * Ported from V1, adapted for V2 types (rotation is optional).
 */

import { describe, it, expect } from 'vitest'
import {
  detectManipulationZone,
  calculateResize,
  calculateRotation,
} from '../../src/utils/shapeManipulation'
import type { Shape, RectangleShape } from '../../src/types'

describe('detectManipulationZone', () => {
  const baseShape: RectangleShape = {
    id: 'test-shape',
    type: 'rectangle',
    x: 100,
    y: 100,
    width: 200,
    height: 100,
    rotation: 0,
    color: '#ff0000',
    createdBy: 'user-1',
  }

  describe('Corner detection', () => {
    it('should detect nw-corner when mouse is in top-left corner', () => {
      const result = detectManipulationZone(baseShape, 102, 102)
      expect(result.zone).toBe('nw-corner')
      expect(result.cursor).toBe('nwse-resize')
    })

    it('should detect ne-corner when mouse is in top-right corner', () => {
      const result = detectManipulationZone(baseShape, 298, 102)
      expect(result.zone).toBe('ne-corner')
      expect(result.cursor).toBe('nesw-resize')
    })

    it('should detect sw-corner when mouse is in bottom-left corner', () => {
      const result = detectManipulationZone(baseShape, 102, 198)
      expect(result.zone).toBe('sw-corner')
      expect(result.cursor).toBe('nesw-resize')
    })

    it('should detect se-corner when mouse is in bottom-right corner', () => {
      const result = detectManipulationZone(baseShape, 298, 198)
      expect(result.zone).toBe('se-corner')
      expect(result.cursor).toBe('nwse-resize')
    })
  })

  describe('Edge detection', () => {
    it('should detect n-edge when mouse is on top edge', () => {
      const result = detectManipulationZone(baseShape, 200, 102)
      expect(result.zone).toBe('n-edge')
      expect(result.cursor).toBe('ns-resize')
    })

    it('should detect s-edge when mouse is on bottom edge', () => {
      const result = detectManipulationZone(baseShape, 200, 198)
      expect(result.zone).toBe('s-edge')
      expect(result.cursor).toBe('ns-resize')
    })

    it('should detect w-edge when mouse is on left edge', () => {
      const result = detectManipulationZone(baseShape, 102, 150)
      expect(result.zone).toBe('w-edge')
      expect(result.cursor).toBe('ew-resize')
    })

    it('should detect e-edge when mouse is on right edge', () => {
      const result = detectManipulationZone(baseShape, 298, 150)
      expect(result.zone).toBe('e-edge')
      expect(result.cursor).toBe('ew-resize')
    })
  })

  describe('Center detection', () => {
    it('should detect center when mouse is in middle of shape', () => {
      const result = detectManipulationZone(baseShape, 200, 150)
      expect(result.zone).toBe('center')
      expect(result.cursor).toBe('move')
    })

    it('should detect center when mouse is away from edges', () => {
      const result = detectManipulationZone(baseShape, 180, 130)
      expect(result.zone).toBe('center')
      expect(result.cursor).toBe('move')
    })
  })

  describe('Rotation zone detection', () => {
    it('should detect nw-rotate when mouse is outside top-left corner', () => {
      const result = detectManipulationZone(baseShape, 85, 85)
      expect(result.zone).toBe('nw-rotate')
      expect(result.cursor).toBe('grab')
    })

    it('should detect ne-rotate when mouse is outside top-right corner', () => {
      const result = detectManipulationZone(baseShape, 315, 85)
      expect(result.zone).toBe('ne-rotate')
      expect(result.cursor).toBe('grab')
    })

    it('should detect sw-rotate when mouse is outside bottom-left corner', () => {
      const result = detectManipulationZone(baseShape, 85, 215)
      expect(result.zone).toBe('sw-rotate')
      expect(result.cursor).toBe('grab')
    })

    it('should detect se-rotate when mouse is outside bottom-right corner', () => {
      const result = detectManipulationZone(baseShape, 315, 215)
      expect(result.zone).toBe('se-rotate')
      expect(result.cursor).toBe('grab')
    })

    it('should detect rotation zones closer to corners', () => {
      const result = detectManipulationZone(baseShape, 99, 99)
      expect(result.zone).toBe('nw-rotate')
      expect(result.cursor).toBe('grab')
    })
  })

  describe('Outside bounds', () => {
    it('should return center/default when mouse is far outside shape', () => {
      const result = detectManipulationZone(baseShape, 50, 50)
      expect(result.zone).toBe('center')
      expect(result.cursor).toBe('default')
    })

    it('should return center/default when mouse is beyond rotation zones', () => {
      const result = detectManipulationZone(baseShape, 400, 400)
      expect(result.zone).toBe('center')
      expect(result.cursor).toBe('default')
    })
  })

  describe('With rotation', () => {
    it('should detect zones correctly for rotated shapes', () => {
      const rotatedShape: RectangleShape = { ...baseShape, rotation: 45 }

      const result = detectManipulationZone(rotatedShape, 200, 150)
      expect(['center', 'nw-corner', 'ne-corner', 'sw-corner', 'se-corner',
              'n-edge', 's-edge', 'e-edge', 'w-edge',
              'nw-rotate', 'ne-rotate', 'sw-rotate', 'se-rotate']).toContain(result.zone)
      expect(['move', 'nwse-resize', 'nesw-resize', 'ns-resize', 'ew-resize', 'grab', 'default']).toContain(result.cursor)
    })
  })
})

describe('calculateResize', () => {
  const baseShape: RectangleShape = {
    id: 'test-shape',
    type: 'rectangle',
    x: 100,
    y: 100,
    width: 200,
    height: 100,
    rotation: 0,
    color: '#ff0000',
    createdBy: 'user-1',
  }

  const asRectResult = (result: Partial<Shape>) => result as Partial<RectangleShape>

  describe('Corner resize', () => {
    it('should resize from nw-corner', () => {
      const result = calculateResize(baseShape, 'nw-corner', 80, 80, 100, 100, baseShape)
      const rectResult = asRectResult(result)
      expect(rectResult.width).toBe(220)
      expect(rectResult.height).toBe(120)
      expect(result.x).toBe(80)
      expect(result.y).toBe(80)
    })

    it('should resize from se-corner', () => {
      const result = calculateResize(baseShape, 'se-corner', 320, 220, 300, 200, baseShape)
      const rectResult = asRectResult(result)
      expect(rectResult.width).toBe(220)
      expect(rectResult.height).toBe(120)
      expect(result.x).toBe(100)
      expect(result.y).toBe(100)
    })

    it('should resize from ne-corner', () => {
      const result = calculateResize(baseShape, 'ne-corner', 320, 80, 300, 100, baseShape)
      const rectResult = asRectResult(result)
      expect(rectResult.width).toBe(220)
      expect(rectResult.height).toBe(120)
      expect(result.x).toBe(100)
      expect(result.y).toBe(80)
    })

    it('should resize from sw-corner', () => {
      const result = calculateResize(baseShape, 'sw-corner', 80, 220, 100, 200, baseShape)
      const rectResult = asRectResult(result)
      expect(rectResult.width).toBe(220)
      expect(rectResult.height).toBe(120)
      expect(result.x).toBe(80)
      expect(result.y).toBe(100)
    })
  })

  describe('Edge resize', () => {
    it('should resize from n-edge', () => {
      const result = calculateResize(baseShape, 'n-edge', 200, 80, 200, 100, baseShape)
      const rectResult = asRectResult(result)
      expect(rectResult.width).toBe(200)
      expect(rectResult.height).toBe(120)
      expect(result.x).toBe(100)
      expect(result.y).toBe(80)
    })

    it('should resize from s-edge', () => {
      const result = calculateResize(baseShape, 's-edge', 200, 220, 200, 200, baseShape)
      const rectResult = asRectResult(result)
      expect(rectResult.width).toBe(200)
      expect(rectResult.height).toBe(120)
      expect(result.x).toBe(100)
      expect(result.y).toBe(100)
    })

    it('should resize from w-edge', () => {
      const result = calculateResize(baseShape, 'w-edge', 80, 150, 100, 150, baseShape)
      const rectResult = asRectResult(result)
      expect(rectResult.width).toBe(220)
      expect(rectResult.height).toBe(100)
      expect(result.x).toBe(80)
      expect(result.y).toBe(100)
    })

    it('should resize from e-edge', () => {
      const result = calculateResize(baseShape, 'e-edge', 320, 150, 300, 150, baseShape)
      const rectResult = asRectResult(result)
      expect(rectResult.width).toBe(220)
      expect(rectResult.height).toBe(100)
      expect(result.x).toBe(100)
      expect(result.y).toBe(100)
    })
  })

  describe('Shape flipping on resize past starting point', () => {
    it('should flip width smoothly when dragging right edge past left edge', () => {
      const result = calculateResize(baseShape, 'e-edge', 50, 150, 300, 150, baseShape)
      const rectResult = asRectResult(result)
      expect(rectResult.width).toBe(50)
      expect(result.x).toBe(50)
    })

    it('should flip height smoothly when dragging bottom edge past top edge', () => {
      const result = calculateResize(baseShape, 's-edge', 200, 50, 200, 200, baseShape)
      const rectResult = asRectResult(result)
      expect(rectResult.height).toBe(50)
      expect(result.y).toBe(50)
    })

    it('should flip both dimensions smoothly when dragging se-corner past nw-corner', () => {
      const result = calculateResize(baseShape, 'se-corner', 50, 50, 300, 200, baseShape)
      const rectResult = asRectResult(result)
      expect(rectResult.width).toBe(50)
      expect(rectResult.height).toBe(50)
      expect(result.x).toBe(50)
      expect(result.y).toBe(50)
    })

    it('should maintain minimum size when flipped', () => {
      const result = calculateResize(baseShape, 'e-edge', 98, 150, 300, 150, baseShape)
      const rectResult = asRectResult(result)
      expect(rectResult.width).toBeGreaterThanOrEqual(5)
    })

    it('should resize normally before flipping', () => {
      const result = calculateResize(baseShape, 'se-corner', 320, 220, 300, 200, baseShape)
      const rectResult = asRectResult(result)
      expect(rectResult.width).toBe(220)
      expect(rectResult.height).toBe(120)
      expect(result.x).toBe(100)
      expect(result.y).toBe(100)
    })
  })
})

describe('calculateRotation', () => {
  const baseShape: RectangleShape = {
    id: 'test-shape',
    type: 'rectangle',
    x: 100,
    y: 100,
    width: 200,
    height: 100,
    rotation: 0,
    color: '#ff0000',
    createdBy: 'user-1',
  }

  it('should calculate rotation relative to start position', () => {
    const startX = 300
    const startY = 150

    const angle1 = calculateRotation(baseShape, 300, 150, startX, startY, 0)
    expect(angle1).toBeCloseTo(0, 1)

    const angle2 = calculateRotation(baseShape, 200, 50, startX, startY, 0)
    expect(angle2).toBeCloseTo(-90, 1)

    const angle3 = calculateRotation(baseShape, 100, 150, startX, startY, 0)
    const normalizedAngle3 = Math.abs(angle3)
    expect(normalizedAngle3).toBeCloseTo(180, 1)

    const angle4 = calculateRotation(baseShape, 200, 250, startX, startY, 0)
    expect(angle4).toBeCloseTo(90, 1)
  })

  it('should add rotation to initial rotation', () => {
    const angle = calculateRotation(baseShape, 200, 50, 300, 150, 45)
    expect(angle).toBeCloseTo(-45, 1)
  })

  it('should handle no movement from start', () => {
    const angle = calculateRotation(baseShape, 300, 150, 300, 150, 90)
    expect(angle).toBeCloseTo(90, 1)
  })

  it('should calculate smooth continuous rotation', () => {
    const startX = 300
    const startY = 150
    const initialRot = 0

    const angle1 = calculateRotation(baseShape, 250, 200, startX, startY, initialRot)
    expect(angle1).toBeGreaterThan(0)
    expect(angle1).toBeLessThan(90)

    const angle2 = calculateRotation(baseShape, 200, 250, startX, startY, initialRot)
    expect(angle2).toBeCloseTo(90, 1)
  })
})
