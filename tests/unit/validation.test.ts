import { describe, it, expect } from 'vitest'
import {
  validateEmail,
  validatePassword,
  validateDisplayName,
  parseFirebaseError,
} from '../../src/utils/validation'

describe('Validation Utils', () => {
  // These are user-facing form boundaries — worth testing because
  // incorrect validation = users locked out or bad data getting through.

  it('rejects empty fields with specific messages', () => {
    expect(validateEmail('').error).toBe('Email is required')
    expect(validatePassword('').error).toBe('Password is required')
    expect(validateDisplayName('').error).toBe('Display name is required')
  })

  it('validates email format (rejects obvious non-emails)', () => {
    expect(validateEmail('user@example.com').isValid).toBe(true)
    expect(validateEmail('notanemail').isValid).toBe(false)
    expect(validateEmail('user@').isValid).toBe(false)
  })

  it('enforces password minimum length', () => {
    expect(validatePassword('12345').isValid).toBe(false)
    expect(validatePassword('123456').isValid).toBe(true)
  })

  it('enforces display name length bounds', () => {
    expect(validateDisplayName('A').isValid).toBe(false)          // too short
    expect(validateDisplayName('Jo').isValid).toBe(true)          // minimum
    expect(validateDisplayName('a'.repeat(51)).isValid).toBe(false) // too long
  })

  describe('parseFirebaseError', () => {
    // These map opaque Firebase error strings to user-friendly messages.
    // Worth testing because the mapping is invisible — if it breaks,
    // users see raw Firebase errors like "auth/invalid-credential".

    it('maps common Firebase auth errors to friendly messages', () => {
      expect(parseFirebaseError('Firebase: Error (auth/email-already-in-use)'))
        .toBe('This email is already registered')
      expect(parseFirebaseError('Firebase: Error (auth/invalid-credential)'))
        .toBe('Invalid email or password')
      expect(parseFirebaseError('Firebase: Error (auth/too-many-requests)'))
        .toBe('Too many failed attempts. Please try again later')
    })

    it('returns original error for unknown Firebase errors', () => {
      expect(parseFirebaseError('Some unknown error')).toBe('Some unknown error')
    })
  })
})
