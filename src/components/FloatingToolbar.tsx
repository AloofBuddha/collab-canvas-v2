/**
 * FloatingToolbar — selection action bar.
 *
 * Visible whenever ≥1 shape is selected. Hosts actions that operate on a
 * selection set (layer ordering, duplicate, group/ungroup, delete). All
 * single-shape property editing lives in SidePanel instead.
 *
 * Positions itself above the bounding box of the current selection.
 */

import { useMemo } from 'react'
import {
  Trash2, ArrowUpToLine, ArrowDownToLine, ArrowUp, ArrowDown,
  Copy, Group as GroupIcon, Ungroup,
} from 'lucide-react'
import type { Shape } from '../types'
import { getShapeBounds } from '../utils/shapeFactory'
import styles from './FloatingToolbar.module.css'

interface FloatingToolbarProps {
  selectedShapes: Shape[]
  stageScale: number
  stagePos: { x: number; y: number }
  addShape: (shape: Shape) => void
  removeShape: (id: string) => void
  bringToFront: (id: string) => void
  sendToBack: (id: string) => void
  bringForward: (id: string) => void
  sendBackward: (id: string) => void
  groupShapes: (ids: string[]) => void
  ungroupShapes: (ids: string[]) => void
  setSelectedShapeIds: (ids: Set<string>) => void
  onDeselect: () => void
}

export default function FloatingToolbar({
  selectedShapes,
  stageScale,
  stagePos,
  addShape,
  removeShape,
  bringToFront,
  sendToBack,
  bringForward,
  sendBackward,
  groupShapes,
  ungroupShapes,
  setSelectedShapeIds,
  onDeselect,
}: FloatingToolbarProps) {
  // Bounding box (world space) of the selection → screen-space top-center.
  const position = useMemo(() => {
    if (selectedShapes.length === 0) return { x: 0, y: 0 }
    let minX = Infinity, minY = Infinity, maxX = -Infinity
    for (const shape of selectedShapes) {
      const b = getShapeBounds(shape)
      minX = Math.min(minX, b.x)
      minY = Math.min(minY, b.y)
      maxX = Math.max(maxX, b.x + b.width)
    }
    const centerX = (minX + maxX) / 2
    return {
      x: centerX * stageScale + stagePos.x,
      y: minY * stageScale + stagePos.y,
    }
  }, [selectedShapes, stageScale, stagePos])

  if (selectedShapes.length === 0) return null

  const forEachSelected = (fn: (id: string) => void) => {
    for (const s of selectedShapes) fn(s.id)
  }

  const handleDelete = () => {
    forEachSelected(removeShape)
    onDeselect()
  }

  const handleDuplicate = () => {
    const newIds = new Set<string>()
    for (const shape of selectedShapes) {
      const newShape: Shape = {
        ...shape,
        id: `shape-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        x: shape.x + 10,
        y: shape.y + 10,
        ...(shape.type === 'line' ? { x2: shape.x2 + 10, y2: shape.y2 + 10 } : {}),
      } as Shape
      addShape(newShape)
      newIds.add(newShape.id)
    }
    setSelectedShapeIds(newIds)
  }

  const selectedIds = selectedShapes.map(s => s.id)
  // 2+ shapes that don't already share a single group can be grouped.
  const distinctGroupIds = new Set(selectedShapes.map(s => s.groupId).filter(Boolean))
  const allInOneGroup = distinctGroupIds.size === 1 && selectedShapes.every(s => s.groupId)
  const canGroup = selectedShapes.length >= 2 && !allInOneGroup
  // Ungroup applies whenever any selected shape belongs to a group.
  const canUngroup = selectedShapes.some(s => !!s.groupId)

  return (
    <div
      className={styles.container}
      style={{ left: position.x, top: position.y - 78 }}
    >
      <div className={styles.toolbar} role="toolbar" aria-label="Selection actions">
        {/* Layer ordering */}
        <button
          className={styles.layerButton}
          onClick={() => forEachSelected(bringToFront)}
          title="Bring to front (Ctrl+])"
          aria-label="Bring to front"
        >
          <ArrowUpToLine size={14} />
        </button>
        <button
          className={styles.layerButton}
          onClick={() => forEachSelected(bringForward)}
          title="Bring forward (])"
          aria-label="Bring forward"
        >
          <ArrowUp size={14} />
        </button>
        <button
          className={styles.layerButton}
          onClick={() => forEachSelected(sendBackward)}
          title="Send backward ([)"
          aria-label="Send backward"
        >
          <ArrowDown size={14} />
        </button>
        <button
          className={styles.layerButton}
          onClick={() => forEachSelected(sendToBack)}
          title="Send to back (Ctrl+[)"
          aria-label="Send to back"
        >
          <ArrowDownToLine size={14} />
        </button>

        <div className={styles.separator} />

        {/* Group / Ungroup */}
        <button
          className={styles.layerButton}
          onClick={() => groupShapes(selectedIds)}
          title={canGroup ? 'Group (Ctrl+G)' : allInOneGroup ? 'Already grouped' : 'Select 2+ shapes to group'}
          aria-label="Group"
          disabled={!canGroup}
          style={!canGroup ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
        >
          <GroupIcon size={14} />
        </button>
        <button
          className={styles.layerButton}
          onClick={() => ungroupShapes(selectedIds)}
          title={canUngroup ? 'Ungroup (Ctrl+Shift+G)' : 'No group selected'}
          aria-label="Ungroup"
          disabled={!canUngroup}
          style={!canUngroup ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
        >
          <Ungroup size={14} />
        </button>

        <div className={styles.separator} />

        {/* Duplicate */}
        <button
          className={styles.layerButton}
          onClick={handleDuplicate}
          title="Duplicate (Ctrl+D)"
          aria-label="Duplicate"
        >
          <Copy size={14} />
        </button>

        <div className={styles.separator} />

        {/* Delete */}
        <button
          className={styles.deleteButton}
          onClick={handleDelete}
          title="Delete (Del)"
          aria-label="Delete"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}
