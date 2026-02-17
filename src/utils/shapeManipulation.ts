/**
 * Shape Manipulation Utilities
 *
 * Provides hit detection and calculation utilities for resizing and rotating shapes.
 * Ported from V1, adapted for V2 types (added sticky note support).
 */

import type { Shape } from '../types'
import Konva from 'konva'
import {
  CORNER_HIT_SIZE,
  EDGE_HIT_SIZE,
  ROTATION_ZONE_WIDTH,
  MIN_SHAPE_SIZE,
} from './canvasConstants'

export type ManipulationZone =
  | 'center'
  | 'nw-corner' | 'ne-corner' | 'sw-corner' | 'se-corner'
  | 'n-edge' | 's-edge' | 'e-edge' | 'w-edge'
  | 'nw-rotate' | 'ne-rotate' | 'sw-rotate' | 'se-rotate'
  | 'start-point' | 'end-point'

export interface HitResult {
  zone: ManipulationZone
  cursor: string
}

/**
 * Detect which manipulation zone the mouse is over
 */
export function detectManipulationZone(
  shape: Shape,
  mouseX: number,
  mouseY: number,
  stageScale: number = 1,
): HitResult {
  if (shape.type === 'line') {
    const cornerSize = CORNER_HIT_SIZE / stageScale

    const distToStart = Math.sqrt(Math.pow(mouseX - shape.x, 2) + Math.pow(mouseY - shape.y, 2))
    const distToEnd = Math.sqrt(Math.pow(mouseX - shape.x2, 2) + Math.pow(mouseY - shape.y2, 2))

    if (distToStart <= cornerSize) return { zone: 'start-point', cursor: 'grab' }
    if (distToEnd <= cornerSize) return { zone: 'end-point', cursor: 'grab' }

    const lineLength = Math.sqrt(Math.pow(shape.x2 - shape.x, 2) + Math.pow(shape.y2 - shape.y, 2))
    if (lineLength > 0) {
      const A = shape.y2 - shape.y
      const B = shape.x - shape.x2
      const C = shape.x2 * shape.y - shape.x * shape.y2
      const distance = Math.abs(A * mouseX + B * mouseY + C) / Math.sqrt(A * A + B * B)
      const t = ((mouseX - shape.x) * (shape.x2 - shape.x) + (mouseY - shape.y) * (shape.y2 - shape.y)) / (lineLength * lineLength)
      if (distance <= cornerSize && t >= 0 && t <= 1) {
        return { zone: 'center', cursor: 'move' }
      }
    }
    return { zone: 'center', cursor: 'default' }
  }

  const { x, y, rotation = 0 } = shape
  const width = getShapeWidth(shape)
  const height = getShapeHeight(shape)
  const cornerSize = CORNER_HIT_SIZE / stageScale
  const edgeSize = EDGE_HIT_SIZE / stageScale
  const centerX = x + width / 2
  const centerY = y + height / 2

  const radians = -(rotation * Math.PI / 180)
  const dx = mouseX - centerX
  const dy = mouseY - centerY
  const localX = centerX + (dx * Math.cos(radians) - dy * Math.sin(radians))
  const localY = centerY + (dx * Math.sin(radians) + dy * Math.cos(radians))

  const distFromLeft = localX - x
  const distFromRight = (x + width) - localX
  const distFromTop = localY - y
  const distFromBottom = (y + height) - localY

  const rotationZoneWidth = ROTATION_ZONE_WIDTH / stageScale
  const inNWRotation = distFromLeft < 0 && distFromLeft > -rotationZoneWidth &&
    distFromTop < 0 && distFromTop > -rotationZoneWidth
  const inNERotation = distFromRight < 0 && distFromRight > -rotationZoneWidth &&
    distFromTop < 0 && distFromTop > -rotationZoneWidth
  const inSWRotation = distFromLeft < 0 && distFromLeft > -rotationZoneWidth &&
    distFromBottom < 0 && distFromBottom > -rotationZoneWidth
  const inSERotation = distFromRight < 0 && distFromRight > -rotationZoneWidth &&
    distFromBottom < 0 && distFromBottom > -rotationZoneWidth

  if (inNWRotation || inNERotation || inSWRotation || inSERotation) {
    const zone: ManipulationZone = inNWRotation ? 'nw-rotate' :
      inNERotation ? 'ne-rotate' :
        inSWRotation ? 'sw-rotate' : 'se-rotate'
    return { zone, cursor: 'grab' }
  }

  const inBounds = distFromLeft >= 0 && distFromRight >= 0 &&
    distFromTop >= 0 && distFromBottom >= 0

  if (!inBounds) return { zone: 'center', cursor: 'default' }

  if (distFromLeft <= cornerSize && distFromTop <= cornerSize) return { zone: 'nw-corner', cursor: 'nwse-resize' }
  if (distFromRight <= cornerSize && distFromTop <= cornerSize) return { zone: 'ne-corner', cursor: 'nesw-resize' }
  if (distFromLeft <= cornerSize && distFromBottom <= cornerSize) return { zone: 'sw-corner', cursor: 'nesw-resize' }
  if (distFromRight <= cornerSize && distFromBottom <= cornerSize) return { zone: 'se-corner', cursor: 'nwse-resize' }
  if (distFromTop <= edgeSize) return { zone: 'n-edge', cursor: 'ns-resize' }
  if (distFromBottom <= edgeSize) return { zone: 's-edge', cursor: 'ns-resize' }
  if (distFromLeft <= edgeSize) return { zone: 'w-edge', cursor: 'ew-resize' }
  if (distFromRight <= edgeSize) return { zone: 'e-edge', cursor: 'ew-resize' }

  return { zone: 'center', cursor: 'move' }
}

/**
 * Calculate new shape dimensions for resize operation
 */
export function calculateResize(
  _shape: Shape,
  zone: ManipulationZone,
  mouseX: number,
  mouseY: number,
  _startMouseX: number,
  _startMouseY: number,
  originalShape: Shape,
): Partial<Shape> {
  if (originalShape.type === 'line') {
    switch (zone) {
      case 'start-point': return { x: mouseX, y: mouseY }
      case 'end-point': return { x2: mouseX, y2: mouseY }
      default: return {}
    }
  }

  const { rotation = 0 } = originalShape
  const radians = -(rotation * Math.PI / 180)
  const originalWidth = getShapeWidth(originalShape)
  const originalHeight = getShapeHeight(originalShape)
  const centerX = originalShape.x + originalWidth / 2
  const centerY = originalShape.y + originalHeight / 2
  const dx = mouseX - centerX
  const dy = mouseY - centerY
  const localMouseX = centerX + (dx * Math.cos(radians) - dy * Math.sin(radians))
  const localMouseY = centerY + (dx * Math.sin(radians) + dy * Math.cos(radians))

  let anchorX: number = originalShape.x
  let anchorY: number = originalShape.y
  let useMouseX = false
  let useMouseY = false

  switch (zone) {
    case 'nw-corner': anchorX = originalShape.x + originalWidth; anchorY = originalShape.y + originalHeight; useMouseX = true; useMouseY = true; break
    case 'ne-corner': anchorX = originalShape.x; anchorY = originalShape.y + originalHeight; useMouseX = true; useMouseY = true; break
    case 'sw-corner': anchorX = originalShape.x + originalWidth; anchorY = originalShape.y; useMouseX = true; useMouseY = true; break
    case 'se-corner': anchorX = originalShape.x; anchorY = originalShape.y; useMouseX = true; useMouseY = true; break
    case 'n-edge': anchorY = originalShape.y + originalHeight; useMouseY = true; break
    case 's-edge': anchorY = originalShape.y; useMouseY = true; break
    case 'w-edge': anchorX = originalShape.x + originalWidth; useMouseX = true; break
    case 'e-edge': anchorX = originalShape.x; useMouseX = true; break
    default: return {}
  }

  let newX = originalShape.x
  let newY = originalShape.y
  let newWidth = getShapeWidth(originalShape)
  let newHeight = getShapeHeight(originalShape)

  if (useMouseX) {
    newX = Math.min(localMouseX, anchorX)
    newWidth = Math.max(MIN_SHAPE_SIZE, Math.abs(localMouseX - anchorX))
  }
  if (useMouseY) {
    newY = Math.min(localMouseY, anchorY)
    newHeight = Math.max(MIN_SHAPE_SIZE, Math.abs(localMouseY - anchorY))
  }

  if (rotation !== 0) {
    const newCenterX = newX + newWidth / 2
    const newCenterY = newY + newHeight / 2
    const dcx = newCenterX - centerX
    const dcy = newCenterY - centerY
    const forwardRadians = rotation * Math.PI / 180
    const rotatedDcx = dcx * Math.cos(forwardRadians) - dcy * Math.sin(forwardRadians)
    const rotatedDcy = dcx * Math.sin(forwardRadians) + dcy * Math.cos(forwardRadians)
    newX = centerX + rotatedDcx - newWidth / 2
    newY = centerY + rotatedDcy - newHeight / 2
  }

  if (originalShape.type === 'rectangle') return { x: newX, y: newY, width: newWidth, height: newHeight }
  if (originalShape.type === 'circle') return { x: newX, y: newY, radiusX: newWidth / 2, radiusY: newHeight / 2 }
  if (originalShape.type === 'text' || originalShape.type === 'sticky') return { x: newX, y: newY, width: newWidth, height: newHeight }
  return {}
}

/**
 * Calculate new rotation angle relative to initial mouse position
 */
export function calculateRotation(
  shape: Shape,
  mouseX: number,
  mouseY: number,
  startMouseX: number,
  startMouseY: number,
  initialRotation: number = 0,
): number {
  const width = getShapeWidth(shape)
  const height = getShapeHeight(shape)
  const centerX = shape.x + width / 2
  const centerY = shape.y + height / 2

  const currentAngle = Math.atan2(mouseY - centerY, mouseX - centerX)
  const startAngle = Math.atan2(startMouseY - centerY, startMouseX - centerX)
  const deltaDegrees = (currentAngle - startAngle) * 180 / Math.PI

  return initialRotation + deltaDegrees
}

/**
 * Get the pointer position relative to the stage (world-space)
 */
export function getPointerPosition(stage: Konva.Stage): { x: number; y: number } | null {
  const pointerPos = stage.getPointerPosition()
  if (!pointerPos) return null
  const transform = stage.getAbsoluteTransform().copy().invert()
  return transform.point(pointerPos)
}

export function getShapeWidth(shape: Shape): number {
  switch (shape.type) {
    case 'rectangle': return shape.width
    case 'circle': return shape.radiusX * 2
    case 'line': return Math.abs(shape.x2 - shape.x)
    case 'text': return shape.width
    case 'sticky': return shape.width
  }
}

export function getShapeHeight(shape: Shape): number {
  switch (shape.type) {
    case 'rectangle': return shape.height
    case 'circle': return shape.radiusY * 2
    case 'line': return Math.abs(shape.y2 - shape.y)
    case 'text': return shape.height
    case 'sticky': return shape.height
  }
}
