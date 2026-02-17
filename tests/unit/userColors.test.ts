import { describe, it, expect } from 'vitest'
import {
  USER_COLOR_PALETTE,
  getUserColorFromId,
  pickAvailableColor,
} from '../../src/utils/userColors'

describe('userColors', () => {
  // Color assignment is worth testing because we had real bugs:
  // - All users got red on simultaneous connect (everyone saw empty room)
  // - Two users got identical greens (palette wasn't distinct enough)
  // The conflict resolution logic is the important part.

  describe('pickAvailableColor', () => {
    it('assigns first available color, skipping taken ones', () => {
      const taken = new Set([USER_COLOR_PALETTE[0], USER_COLOR_PALETTE[1]])
      const color = pickAvailableColor(taken, 'fallback')
      expect(color).toBe(USER_COLOR_PALETTE[2])
    })

    it('assigns unique colors to sequential users in the same room', () => {
      const taken = new Set<string>()
      const assigned: string[] = []

      for (let i = 0; i < USER_COLOR_PALETTE.length; i++) {
        const color = pickAvailableColor(taken, `user-${i}`)
        assigned.push(color)
        taken.add(color)
      }

      // Every user in the room should have a distinct color
      expect(new Set(assigned).size).toBe(USER_COLOR_PALETTE.length)
    })

    it('falls back to hash when all palette colors are taken', () => {
      const taken = new Set(USER_COLOR_PALETTE as readonly string[])
      const color = pickAvailableColor(taken, 'overflow-user')
      // Should still return a valid color (from hash), not crash
      expect(color).toBeTruthy()
      expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/)
    })
  })

  describe('getUserColorFromId', () => {
    it('is deterministic — same ID always gets same color', () => {
      const color1 = getUserColorFromId('user-abc')
      const color2 = getUserColorFromId('user-abc')
      expect(color1).toBe(color2)
    })
  })
})
