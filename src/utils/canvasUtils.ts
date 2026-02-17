/**
 * Canvas Utility Functions
 *
 * Ported from V1, adapted for V2 types.
 */

import type { Tool } from '../types'

/**
 * Get cursor style based on tool and interaction state
 */
export function getCursorStyle(
  isPanning: boolean,
  isDrawing: boolean,
  tool: Tool,
): string {
  if (isPanning) return 'grabbing'
  if (isDrawing) return 'crosshair'
  if (tool !== 'select') return 'crosshair'
  return 'default'
}
