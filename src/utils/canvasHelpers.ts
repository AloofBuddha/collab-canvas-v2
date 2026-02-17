/**
 * Canvas Helper Functions
 *
 * Pure utility functions for canvas behavior.
 */

export type OperationType =
  | 'panning'
  | 'drawing'
  | 'manipulating'
  | 'dragging'
  | 'just-finished'

/**
 * Determines if deselection should be prevented based on current operation state.
 */
export function shouldPreventDeselection(currentOperation: OperationType | null): boolean {
  return currentOperation !== null
}
