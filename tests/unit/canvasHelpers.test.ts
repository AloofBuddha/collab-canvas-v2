import { describe, it, expect } from 'vitest'
import { shouldPreventDeselection } from '../../src/utils/canvasHelpers'

describe('shouldPreventDeselection', () => {
  it('should prevent deselection when panning', () => {
    expect(shouldPreventDeselection('panning')).toBe(true)
  })

  it('should prevent deselection when drawing', () => {
    expect(shouldPreventDeselection('drawing')).toBe(true)
  })

  it('should prevent deselection when manipulating (resize/rotate)', () => {
    expect(shouldPreventDeselection('manipulating')).toBe(true)
  })

  it('should prevent deselection when dragging', () => {
    expect(shouldPreventDeselection('dragging')).toBe(true)
  })

  it('should prevent deselection when operation just finished', () => {
    expect(shouldPreventDeselection('just-finished')).toBe(true)
  })

  it('should allow deselection when no operations are active', () => {
    expect(shouldPreventDeselection(null)).toBe(false)
  })
})
