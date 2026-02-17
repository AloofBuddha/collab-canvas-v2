/**
 * Firebase Auth utilities for V2
 *
 * Simplified from V1: no Firestore user profiles, no presence cleanup.
 * Display name stored in Firebase Auth updateProfile + passed to Yjs awareness.
 */

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
} from 'firebase/auth'
import { auth } from './firebase'

interface AuthResult {
  success: boolean
  error?: string
}

export async function signUp(email: string, password: string, displayName: string): Promise<AuthResult> {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password)
    await updateProfile(cred.user, { displayName })
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  try {
    await signInWithEmailAndPassword(auth, email, password)
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

export async function signOut(): Promise<AuthResult> {
  try {
    await firebaseSignOut(auth)
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}
