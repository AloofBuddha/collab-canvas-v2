/**
 * Canvas Constants
 *
 * Centralized constants for canvas behavior and styling
 */

// Zoom limits
export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 5
export const ZOOM_SCALE_FACTOR = 1.1

// Shape creation and manipulation
export const MIN_SHAPE_SIZE = 5

// Hit zone configuration for shape manipulation
export const CORNER_HIT_SIZE = 10 // Distance from corner to trigger resize
export const EDGE_HIT_SIZE = 5 // Distance from edge to trigger resize
export const ROTATION_ZONE_WIDTH = 30 // Width of rotation zone starting at corner edge

// Canvas layout
export const HEADER_HEIGHT = 64

// Shape styling
export const SHAPE_OPACITY = 0.8
export const NEW_SHAPE_OPACITY = 0.5
export const NEW_SHAPE_STROKE_WIDTH = 2
export const NEW_SHAPE_DASH = [5, 5]

// Selection/border colors
export const SELECTION_COLOR = '#3B82F6'
export const LINE_HANDLE_FILL = '#3B82F6'
export const LINE_HANDLE_STROKE = '#FFFFFF'
export const NEW_SHAPE_COLOR = '#D1D5DB'
