/**
 * Throttle Utility
 *
 * Throttles function execution to a maximum frequency
 */

/**
 * Throttle a function to execute at most once per interval
 * @param func - Function to throttle
 * @param delay - Minimum delay between executions in milliseconds
 * @returns Throttled function
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function throttle<T extends (...args: any[]) => void>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let lastCall = 0
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  return (...args: Parameters<T>) => {
    const now = Date.now()
    const timeSinceLastCall = now - lastCall

    // Clear any pending timeout
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }

    if (timeSinceLastCall >= delay) {
      // Enough time has passed, execute immediately
      lastCall = now
      func(...args)
    } else {
      // Schedule execution for the remaining time
      const remainingTime = delay - timeSinceLastCall
      timeoutId = setTimeout(() => {
        lastCall = Date.now()
        func(...args)
        timeoutId = null
      }, remainingTime)
    }
  }
}

/**
 * Throttle rate for cursor updates (~20Hz = 50ms)
 */
export const CURSOR_THROTTLE_MS = 50
