import { describe, it, expect } from 'vitest'
import {
  USER_COLOR_PALETTE,
  getUserColorFromId,
  pickAvailableColor,
  getColorName,
} from '../../src/utils/userColors'

describe('userColors', () => {
  describe('USER_COLOR_PALETTE', () => {
    it('should have 12 colors', () => {
      expect(USER_COLOR_PALETTE).toHaveLength(12)
    })

    it('should contain only unique colors', () => {
      const uniqueColors = new Set(USER_COLOR_PALETTE)
      expect(uniqueColors.size).toBe(USER_COLOR_PALETTE.length)
    })

    it('should contain valid hex colors', () => {
      USER_COLOR_PALETTE.forEach(color => {
        expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/)
      })
    })
  })

  describe('getUserColorFromId', () => {
    it('should return a color from the palette', () => {
      const color = getUserColorFromId('user-123')
      expect(USER_COLOR_PALETTE).toContain(color)
    })

    it('should return the same color for the same ID', () => {
      const color1 = getUserColorFromId('user-abc')
      const color2 = getUserColorFromId('user-abc')
      expect(color1).toBe(color2)
    })

    it('should return different colors for different IDs (usually)', () => {
      const colors = new Set<string>()
      for (let i = 0; i < 100; i++) {
        colors.add(getUserColorFromId(`user-${i}`))
      }
      // With 12 colors and 100 users, we should use most of the palette
      expect(colors.size).toBeGreaterThan(5)
    })
  })

  describe('pickAvailableColor', () => {
    it('should return the first palette color when no colors are taken', () => {
      const color = pickAvailableColor(new Set(), 'fallback-id')
      expect(color).toBe(USER_COLOR_PALETTE[0])
    })

    it('should skip taken colors and return the first available', () => {
      const taken = new Set([USER_COLOR_PALETTE[0]])
      const color = pickAvailableColor(taken, 'fallback-id')
      expect(color).toBe(USER_COLOR_PALETTE[1])
    })

    it('should return third color when first two are taken', () => {
      const taken = new Set([USER_COLOR_PALETTE[0], USER_COLOR_PALETTE[1]])
      const color = pickAvailableColor(taken, 'fallback-id')
      expect(color).toBe(USER_COLOR_PALETTE[2])
    })

    it('should fall back to hash-based color when all palette colors are taken', () => {
      const taken = new Set(USER_COLOR_PALETTE as readonly string[])
      const color = pickAvailableColor(taken, 'fallback-id')
      // Falls back to getUserColorFromId — result is from palette
      expect(USER_COLOR_PALETTE).toContain(color)
    })

    it('should assign distinct colors for sequential users', () => {
      const taken = new Set<string>()
      const assigned: string[] = []

      for (let i = 0; i < USER_COLOR_PALETTE.length; i++) {
        const color = pickAvailableColor(taken, `user-${i}`)
        assigned.push(color)
        taken.add(color)
      }

      // All assigned colors should be unique (no duplicates within palette size)
      const unique = new Set(assigned)
      expect(unique.size).toBe(USER_COLOR_PALETTE.length)
    })
  })

  describe('getColorName', () => {
    it('should return human-readable name for palette colors', () => {
      expect(getColorName('#EF4444')).toBe('Red')
      expect(getColorName('#F97316')).toBe('Orange')
      expect(getColorName('#22C55E')).toBe('Green')
      expect(getColorName('#A855F7')).toBe('Purple')
    })

    it('should return Unknown for non-palette colors', () => {
      expect(getColorName('#000000')).toBe('Unknown')
      expect(getColorName('#FFFFFF')).toBe('Unknown')
    })
  })
})
