/**
 * User Utility Functions
 *
 * Helper functions for user-related operations
 */

/**
 * Extract initials from a display name
 * - If name has multiple words, use first letter of first two words
 * - If name has one word, use just the first letter
 * @param displayName - The user's display name
 * @returns Uppercase initials (1-2 characters)
 */
export function getInitials(displayName: string): string {
  const trimmed = displayName.trim()
  if (!trimmed) return '?'

  const words = trimmed.split(/\s+/)

  if (words.length >= 2) {
    // Two or more words: use first letter of first two words
    return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase()
  } else {
    // One word: use just the first letter
    return words[0].charAt(0).toUpperCase()
  }
}
