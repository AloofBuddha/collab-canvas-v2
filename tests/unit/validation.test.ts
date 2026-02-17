import { describe, it, expect } from 'vitest'
import {
  validateEmail,
  validatePassword,
  validateDisplayName,
  parseFirebaseError,
} from '../../src/utils/validation'

describe('Validation Utils', () => {
  describe('validateEmail', () => {
    it('should accept valid email addresses', () => {
      const validEmails = [
        'test@example.com',
        'user.name@example.com',
        'user+tag@example.co.uk',
        'user123@test-domain.com',
      ]

      validEmails.forEach(email => {
        const result = validateEmail(email)
        expect(result.isValid).toBe(true)
        expect(result.error).toBeUndefined()
      })
    })

    it('should reject empty email', () => {
      const result = validateEmail('')
      expect(result.isValid).toBe(false)
      expect(result.error).toBe('Email is required')
    })

    it('should reject invalid email formats', () => {
      const invalidEmails = [
        'notanemail',
        '@example.com',
        'user@',
        'user@.com',
        'user @example.com',
        'user@example',
      ]

      invalidEmails.forEach(email => {
        const result = validateEmail(email)
        expect(result.isValid).toBe(false)
        expect(result.error).toBe('Invalid email format')
      })
    })
  })

  describe('validatePassword', () => {
    it('should accept passwords with 6+ characters', () => {
      const validPasswords = [
        '123456',
        'password',
        'Pass123!@#',
        'a'.repeat(100),
      ]

      validPasswords.forEach(password => {
        const result = validatePassword(password)
        expect(result.isValid).toBe(true)
        expect(result.error).toBeUndefined()
      })
    })

    it('should reject empty password', () => {
      const result = validatePassword('')
      expect(result.isValid).toBe(false)
      expect(result.error).toBe('Password is required')
    })

    it('should reject passwords less than 6 characters', () => {
      const shortPasswords = ['1', '12', '123', '1234', '12345']

      shortPasswords.forEach(password => {
        const result = validatePassword(password)
        expect(result.isValid).toBe(false)
        expect(result.error).toBe('Password must be at least 6 characters')
      })
    })
  })

  describe('validateDisplayName', () => {
    it('should accept valid display names', () => {
      const validNames = [
        'Jo',
        'John',
        'John Doe',
        'Alice Smith',
        'User 123',
        'a'.repeat(50),
      ]

      validNames.forEach(name => {
        const result = validateDisplayName(name)
        expect(result.isValid).toBe(true)
        expect(result.error).toBeUndefined()
      })
    })

    it('should reject empty display name', () => {
      const result = validateDisplayName('')
      expect(result.isValid).toBe(false)
      expect(result.error).toBe('Display name is required')
    })

    it('should reject names less than 2 characters', () => {
      const result = validateDisplayName('A')
      expect(result.isValid).toBe(false)
      expect(result.error).toBe('Display name must be at least 2 characters')
    })

    it('should reject names longer than 50 characters', () => {
      const result = validateDisplayName('a'.repeat(51))
      expect(result.isValid).toBe(false)
      expect(result.error).toBe('Display name must be less than 50 characters')
    })
  })

  describe('parseFirebaseError', () => {
    it('should parse email-already-in-use error', () => {
      const result = parseFirebaseError('Firebase: Error (auth/email-already-in-use)')
      expect(result).toBe('This email is already registered')
    })

    it('should parse invalid-email error', () => {
      const result = parseFirebaseError('Firebase: Error (auth/invalid-email)')
      expect(result).toBe('Invalid email address')
    })

    it('should parse weak-password error', () => {
      const result = parseFirebaseError('Firebase: Error (auth/weak-password)')
      expect(result).toBe('Password is too weak')
    })

    it('should parse user-not-found error', () => {
      const result = parseFirebaseError('Firebase: Error (auth/user-not-found)')
      expect(result).toBe('No account found with this email')
    })

    it('should parse wrong-password error', () => {
      const result = parseFirebaseError('Firebase: Error (auth/wrong-password)')
      expect(result).toBe('Incorrect password')
    })

    it('should parse invalid-credential error', () => {
      const result = parseFirebaseError('Firebase: Error (auth/invalid-credential)')
      expect(result).toBe('Invalid email or password')
    })

    it('should parse too-many-requests error', () => {
      const result = parseFirebaseError('Firebase: Error (auth/too-many-requests)')
      expect(result).toBe('Too many failed attempts. Please try again later')
    })

    it('should return original error for unknown errors', () => {
      const unknownError = 'Some unknown error'
      const result = parseFirebaseError(unknownError)
      expect(result).toBe(unknownError)
    })
  })
})
