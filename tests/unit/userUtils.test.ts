import { describe, it, expect } from 'vitest'
import { getInitials } from '../../src/utils/userUtils'

describe('userUtils', () => {
  describe('getInitials', () => {
    it('should return first two initials for two-word names', () => {
      expect(getInitials('John Doe')).toBe('JD')
      expect(getInitials('Alice Smith')).toBe('AS')
      expect(getInitials('Bob Jones')).toBe('BJ')
    })

    it('should return first two initials for multi-word names', () => {
      expect(getInitials('John Paul Smith')).toBe('JP')
      expect(getInitials('Mary Jane Watson Parker')).toBe('MJ')
    })

    it('should return single initial for one-word names', () => {
      expect(getInitials('Madonna')).toBe('M')
      expect(getInitials('Prince')).toBe('P')
      expect(getInitials('Cher')).toBe('C')
    })

    it('should handle lowercase names', () => {
      expect(getInitials('john doe')).toBe('JD')
      expect(getInitials('alice')).toBe('A')
    })

    it('should handle mixed case names', () => {
      expect(getInitials('JoHn DoE')).toBe('JD')
      expect(getInitials('aLiCe')).toBe('A')
    })

    it('should handle extra whitespace', () => {
      expect(getInitials('  John   Doe  ')).toBe('JD')
      expect(getInitials('  Alice  ')).toBe('A')
      expect(getInitials('John  Paul  Smith')).toBe('JP')
    })

    it('should handle empty or invalid names', () => {
      expect(getInitials('')).toBe('?')
      expect(getInitials('   ')).toBe('?')
    })

    it('should handle names with special characters', () => {
      expect(getInitials("O'Brien Smith")).toBe('OS')
      expect(getInitials('Jean-Paul Sartre')).toBe('JS')
      expect(getInitials('Müller')).toBe('M')
    })
  })
})
