/**
 * AuthPage - Login/signup form
 *
 * Ported from V1, converted Tailwind → CSS Modules.
 * Simplified: uses Firebase Auth only (no Firestore user profiles).
 */

import { useState } from 'react'
import { signIn, signUp } from '../utils/auth'
import { validateEmail, validatePassword, validateDisplayName, parseFirebaseError } from '../utils/validation'
import styles from './AuthPage.module.css'

type AuthMode = 'login' | 'signup'

export default function AuthPage() {
  const [mode, setMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const isFormValid = () => {
    if (!email.trim() || !password.trim()) return false
    if (mode === 'signup' && !displayName.trim()) return false
    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const emailV = validateEmail(email)
    if (!emailV.isValid) { setError(emailV.error!); return }

    const passwordV = validatePassword(password)
    if (!passwordV.isValid) { setError(passwordV.error!); return }

    if (mode === 'signup') {
      const nameV = validateDisplayName(displayName)
      if (!nameV.isValid) { setError(nameV.error!); return }
    }

    setLoading(true)
    try {
      const result = mode === 'signup'
        ? await signUp(email, password, displayName)
        : await signIn(email, password)

      if (!result.success && result.error) {
        setError(parseFirebaseError(result.error))
      }
    } catch {
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  const toggleMode = () => {
    setMode(mode === 'login' ? 'signup' : 'login')
    setError('')
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <h1 className={styles.title}>CollabBoard</h1>
          <p className={styles.subtitle}>
            {mode === 'login' ? 'Sign in to your account' : 'Create your account'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          {mode === 'signup' && (
            <div className={styles.field}>
              <label htmlFor="displayName">Display Name</label>
              <input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter your name"
                disabled={loading}
              />
            </div>
          )}

          <div className={styles.field}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={loading}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              disabled={loading}
            />
            {mode === 'signup' && <p className={styles.hint}>Minimum 6 characters</p>}
          </div>

          {error && <div className={styles.error}>{error}</div>}

          <button
            type="submit"
            disabled={loading || !isFormValid()}
            className={styles.submitButton}
          >
            {loading ? 'Loading...' : mode === 'login' ? 'Sign In' : 'Sign Up'}
          </button>
        </form>

        <div className={styles.footer}>
          <button type="button" onClick={toggleMode} disabled={loading} className={styles.toggleButton}>
            {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
          </button>
        </div>
      </div>
    </div>
  )
}
